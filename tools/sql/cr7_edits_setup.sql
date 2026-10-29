-- CR7的小世界 · 网友编辑自己的投稿
-- 规则（主人宝宝定的）：
--   还没审核 / 被驳回的稿：直接改原稿，状态回到"待审核"
--   已经通过的稿：旧版继续显示，改动先存成一份"修改稿"，站长通过后才替换上去
--   可以换图；不能删稿；补充和纠错不能编辑；挂在哪个人物下面不能改
-- 网友凭查询码（token）证明这条是自己的

create table if not exists public.submission_edits (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  submission_id    uuid not null references public.submissions(id) on delete cascade,
  summary          text not null check (char_length(summary) between 1 and 100),
  event_date       text check (char_length(event_date) <= 50),
  detail           text check (char_length(detail) <= 3000),
  source           text check (char_length(source) <= 300),
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  uploader         text check (char_length(uploader) <= 30),
  image_paths      text[] not null default '{}' check (cardinality(image_paths) <= 9),
  video_url        text check (char_length(video_url) <= 500),
  person_role      text check (char_length(person_role) <= 60),
  person_alias     text check (char_length(person_alias) <= 100),
  fanwork_type     text check (fanwork_type is null or fanwork_type in ('混剪', '同人文', '同人图', '修图', '其它')),
  fanwork_platform text check (char_length(fanwork_platform) <= 30),
  fanwork_author   text check (char_length(fanwork_author) <= 60),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note      text check (char_length(review_note) <= 500),
  reviewed_at      timestamptz
);
create unique index if not exists submission_edits_one_pending on public.submission_edits(submission_id) where status = 'pending';
create index if not exists submission_edits_created_idx on public.submission_edits(created_at desc);

alter table public.submission_edits enable row level security;
revoke all on public.submission_edits from anon, authenticated;
grant select, update, delete on public.submission_edits to authenticated;
grant select, insert, update, delete on public.submission_edits to service_role;

drop policy if exists edits_admin_select on public.submission_edits;
create policy edits_admin_select on public.submission_edits for select to authenticated using (public.is_admin());
drop policy if exists edits_admin_update on public.submission_edits;
create policy edits_admin_update on public.submission_edits for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists edits_admin_delete on public.submission_edits;
create policy edits_admin_delete on public.submission_edits for delete to authenticated using (public.is_admin());

-- 有没有别的地方还在用这张图（别的投稿、别的修改稿）
create or replace function public._image_used_elsewhere(p_path text, p_sub uuid, p_edit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions s where s.id <> p_sub and p_path = any(s.image_paths))
      or exists (select 1 from public.submission_edits e where e.id is distinct from p_edit and e.status = 'pending' and p_path = any(e.image_paths));
$$;
revoke all on function public._image_used_elsewhere(text, uuid, uuid) from public, anon, authenticated;

-- 网友：读自己这条的内容（有修改稿就读修改稿），用来把编辑表单填好
create or replace function public.get_my_submission(p_token uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.submissions; e public.submission_edits; out jsonb; who text;
begin
  select * into s from public.submissions where id = p_id and token = p_token;
  if not found then return null; end if;
  select * into e from public.submission_edits where submission_id = s.id and status = 'pending';
  if s.person_id is not null then select summary into who from public.submissions where id = s.person_id; end if;
  out := jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'section', s.section, 'status', s.status, 'person_id', s.person_id, 'person_name', who,
    'has_pending_edit', e.id is not null);
  if e.id is not null then
    out := out || jsonb_build_object('summary', e.summary, 'event_date', e.event_date, 'detail', e.detail, 'source', e.source,
      'tags', to_jsonb(e.tags), 'uploader', e.uploader, 'image_paths', to_jsonb(e.image_paths), 'video_url', e.video_url,
      'person_role', e.person_role, 'person_alias', e.person_alias,
      'fanwork_type', e.fanwork_type, 'fanwork_platform', e.fanwork_platform, 'fanwork_author', e.fanwork_author);
  else
    out := out || jsonb_build_object('summary', s.summary, 'event_date', s.event_date, 'detail', s.detail, 'source', s.source,
      'tags', to_jsonb(s.tags), 'uploader', s.uploader, 'image_paths', to_jsonb(s.image_paths), 'video_url', s.video_url,
      'person_role', s.person_role, 'person_alias', s.person_alias,
      'fanwork_type', s.fanwork_type, 'fanwork_platform', s.fanwork_platform, 'fanwork_author', s.fanwork_author);
  end if;
  return out;
end $$;
revoke all on function public.get_my_submission(uuid, uuid) from public;
grant execute on function public.get_my_submission(uuid, uuid) to anon, authenticated;

-- 网友：交修改
create or replace function public.submit_edit(p_token uuid, p_id uuid, p_data jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.submissions;
  pe uuid;
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'tags', '[]'::jsonb))), '{}');
  v_imgs text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'image_paths', '[]'::jsonb))), '{}');
  v_summary text := nullif(btrim(coalesce(p_data->>'summary', '')), '');
  p text;
begin
  select * into s from public.submissions where id = p_id and token = p_token for update;
  if not found then raise exception '查询码和这条投稿对不上'; end if;
  if s.kind not in ('upload', 'person') then raise exception '补充和纠错不能编辑'; end if;
  if v_summary is null then raise exception '一句话介绍不能空着'; end if;
  if s.kind = 'person' and cardinality(v_imgs) > 1 then raise exception '头像只能一张'; end if;
  if s.section = 'fanworks' and s.kind = 'upload' and (
       nullif(p_data->>'fanwork_type', '') is null
    or nullif(btrim(coalesce(p_data->>'fanwork_platform', '')), '') is null
    or nullif(btrim(coalesce(p_data->>'fanwork_author', '')), '') is null) then
    raise exception '二创的分类、来源平台、原作者都要填';
  end if;

  select id into pe from public.submission_edits where submission_id = s.id and status = 'pending';

  -- 图片：只能用这条自己原来的图，或者新传、没被别人用的图
  foreach p in array v_imgs loop
    if p !~ '^(\d{4}-\d{2}-\d{2}/[0-9a-f-]{36}/\d+|covers/[0-9a-f-]{36})\.(jpg|png|webp|gif)$' then
      raise exception '图片地址不对';
    end if;
    if not (p = any(s.image_paths)) and public._image_used_elsewhere(p, s.id, pe) then
      raise exception '图片地址不对';
    end if;
  end loop;

  if s.status = 'approved' then
    -- 已通过：存成修改稿，旧版照常显示
    delete from public.submission_edits where id = pe;
    insert into public.submission_edits (submission_id, summary, event_date, detail, source, tags, uploader, image_paths, video_url,
      person_role, person_alias, fanwork_type, fanwork_platform, fanwork_author)
    values (s.id, v_summary, nullif(p_data->>'event_date', ''), nullif(p_data->>'detail', ''), nullif(p_data->>'source', ''),
      v_tags, nullif(p_data->>'uploader', ''), v_imgs, nullif(p_data->>'video_url', ''),
      nullif(p_data->>'person_role', ''), nullif(p_data->>'person_alias', ''),
      nullif(p_data->>'fanwork_type', ''), nullif(p_data->>'fanwork_platform', ''), nullif(p_data->>'fanwork_author', ''));
    return 'edit_pending';
  end if;

  -- 还没审核 / 被驳回：直接改原稿，重新排队审核
  update public.submissions set
    summary = v_summary, event_date = nullif(p_data->>'event_date', ''), detail = nullif(p_data->>'detail', ''),
    source = nullif(p_data->>'source', ''), tags = v_tags, uploader = nullif(p_data->>'uploader', ''),
    image_paths = v_imgs, video_url = nullif(p_data->>'video_url', ''),
    person_role = nullif(p_data->>'person_role', ''), person_alias = nullif(p_data->>'person_alias', ''),
    fanwork_type = nullif(p_data->>'fanwork_type', ''), fanwork_platform = nullif(p_data->>'fanwork_platform', ''),
    fanwork_author = nullif(p_data->>'fanwork_author', ''),
    status = 'pending', review_note = null, reviewed_at = null
  where id = s.id;
  return 'resubmitted';
end $$;
revoke all on function public.submit_edit(uuid, uuid, jsonb) from public;
grant execute on function public.submit_edit(uuid, uuid, jsonb) to anon, authenticated;

-- 网友：查自己投稿最近一次修改的审核结果
create or replace function public.check_edits(p_tokens uuid[])
returns table (token uuid, submission_id uuid, status text, review_note text, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (s.id) s.token, s.id, e.status, e.review_note, e.created_at, e.reviewed_at
  from public.submissions s join public.submission_edits e on e.submission_id = s.id
  where s.token = any(p_tokens[1:50])
  order by s.id, e.created_at desc;
$$;
revoke all on function public.check_edits(uuid[]) from public;
grant execute on function public.check_edits(uuid[]) to anon, authenticated;

-- 站长：通过修改，把修改稿替换上去。返回可以从图片仓库删掉的旧图
create or replace function public.apply_edit(p_edit uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare e public.submission_edits; s public.submissions; gone text[];
begin
  if not public.is_admin() then raise exception '不是站长'; end if;
  select * into e from public.submission_edits where id = p_edit and status = 'pending' for update;
  if not found then raise exception '这份修改已经处理过了'; end if;
  select * into s from public.submissions where id = e.submission_id for update;
  update public.submissions set
    summary = e.summary, event_date = e.event_date, detail = e.detail, source = e.source, tags = e.tags,
    uploader = e.uploader, image_paths = e.image_paths, video_url = e.video_url,
    person_role = e.person_role, person_alias = e.person_alias,
    fanwork_type = e.fanwork_type, fanwork_platform = e.fanwork_platform, fanwork_author = e.fanwork_author,
    reviewed_at = now()
  where id = s.id;
  update public.submission_edits set status = 'approved', reviewed_at = now() where id = e.id;
  select coalesce(array_agg(p), '{}') into gone from unnest(s.image_paths) p
    where not (p = any(e.image_paths)) and not public._image_used_elsewhere(p, s.id, e.id);
  return gone;
end $$;
revoke all on function public.apply_edit(uuid) from public, anon;
grant execute on function public.apply_edit(uuid) to authenticated;

-- 站长：驳回修改。原稿不动，返回修改稿里新传、可以删掉的图
create or replace function public.reject_edit(p_edit uuid, p_note text)
returns text[] language plpgsql security definer set search_path = '' as $$
declare e public.submission_edits; s public.submissions; gone text[];
begin
  if not public.is_admin() then raise exception '不是站长'; end if;
  select * into e from public.submission_edits where id = p_edit and status = 'pending' for update;
  if not found then raise exception '这份修改已经处理过了'; end if;
  select * into s from public.submissions where id = e.submission_id;
  update public.submission_edits set status = 'rejected', review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_at = now() where id = e.id;
  select coalesce(array_agg(p), '{}') into gone from unnest(e.image_paths) p
    where not (p = any(s.image_paths)) and not public._image_used_elsewhere(p, s.id, e.id);
  return gone;
end $$;
revoke all on function public.reject_edit(uuid, text) from public, anon;
grant execute on function public.reject_edit(uuid, text) to authenticated;
