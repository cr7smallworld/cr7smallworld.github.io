-- CR7的小世界：个人主页 / 消息小红点 / 收藏 / 贡献榜
-- 公开署名 public_member：登录且没勾匿名的，填用户名；前台能读，用来做"点名字进主页"

alter table public.submissions add column if not exists public_member text;
alter table public.comments add column if not exists public_member text;
update public.submissions set public_member = member_name where member_id is not null and not is_anon and public_member is null;
update public.comments set public_member = member_name where member_id is not null and not is_anon and public_member is null;
grant select (public_member) on public.submissions to anon, authenticated;
grant select (public_member) on public.comments to anon, authenticated;

create or replace function public._submissions_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text;
begin
  if tg_op = 'INSERT' then
    new.member_id := null; new.member_name := null;
    if new.member_token is not null then
      select b.id, b.username into v_id, v_name from public._member_by_token(new.member_token) b;
      new.member_id := v_id; new.member_name := v_name;
    end if;
    new.member_token := null;
    if new.member_id is null then new.is_anon := false; end if;
    new.public_member := case when new.member_id is not null and not new.is_anon then new.member_name end;
  else
    new.member_id := old.member_id; new.member_name := old.member_name;
    new.is_anon := old.is_anon; new.member_token := null; new.public_member := old.public_member;
  end if;
  if new.member_id is not null then
    new.uploader := case when new.is_anon then null else new.member_name end;
  end if;
  return new;
end $$;

-- 评论：登录且不匿名的也记公开署名
create or replace function public.add_comment(
  p_target uuid, p_parent uuid, p_nickname text, p_content text, p_token uuid,
  p_member_token text default null, p_anon boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid; v_reply_to text; v_ip text; v_id uuid; v_nick text; v_content text;
  v_mid uuid; v_mname text;
begin
  v_content := btrim(coalesce(p_content, ''));
  if char_length(v_content) = 0 then raise exception '评论内容不能为空'; end if;
  if char_length(v_content) > 500 then raise exception '评论最多500字'; end if;
  if p_member_token is not null then
    select b.id, b.username into v_mid, v_mname from public._member_by_token(p_member_token) b;
  end if;
  if v_mid is not null then
    v_nick := case when coalesce(p_anon, false) then '匿名罗蜜' else v_mname end;
  else
    v_nick := nullif(btrim(coalesce(p_nickname, '')), '');
    v_nick := left(coalesce(v_nick, '匿名罗蜜'), 20);
  end if;
  if p_token is null then raise exception '缺少口令'; end if;
  if not exists (select 1 from public.submissions s where s.id = p_target and s.status = 'approved') then
    raise exception '这条内容不存在或还没通过审核';
  end if;
  if p_parent is not null then
    select coalesce(c.parent_id, c.id), c.nickname into v_parent, v_reply_to
      from public.comments c where c.id = p_parent and c.target_id = p_target;
    if v_parent is null then raise exception '要回复的评论不在了'; end if;
  end if;
  begin
    v_ip := split_part(coalesce((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ''), ',', 1);
  exception when others then v_ip := '';
  end;
  if v_ip <> '' then
    v_ip := md5(v_ip || 'cr7-salt');
    if (select count(*) from public.comments c where c.ip_hash = v_ip and c.created_at > now() - interval '1 minute') >= 5 then
      raise exception '发得太快啦，歇一分钟再来';
    end if;
  else v_ip := null;
  end if;
  insert into public.comments(target_id, parent_id, reply_to, nickname, content, owner_token, ip_hash, member_id, member_name, is_anon, public_member)
    values (p_target, v_parent, case when p_parent is not null and p_parent <> v_parent then v_reply_to end,
            v_nick, v_content, p_token, v_ip, v_mid, v_mname, v_mid is not null and coalesce(p_anon, false),
            case when v_mid is not null and not coalesce(p_anon, false) then v_mname end)
    returning id into v_id;
  return v_id;
end $$;

-- ---------- 收藏 ----------
create table if not exists public.favorites (
  member_id uuid not null references public.members(id) on delete cascade,
  target_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, target_id)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant all on public.favorites to service_role;

create or replace function public.member_fav_toggle(p_token text, p_target uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid;
begin
  select b.id into v_mid from public._member_by_token(p_token) b;
  if v_mid is null then raise exception '先登录才能收藏'; end if;
  if exists (select 1 from public.favorites f where f.member_id = v_mid and f.target_id = p_target) then
    delete from public.favorites where member_id = v_mid and target_id = p_target;
    return false;
  end if;
  if not exists (select 1 from public.submissions s where s.id = p_target and s.status = 'approved') then
    raise exception '这条内容不存在了';
  end if;
  if (select count(*) from public.favorites f where f.member_id = v_mid) >= 1000 then
    raise exception '收藏满1000条啦，先删掉一些';
  end if;
  insert into public.favorites(member_id, target_id) values (v_mid, p_target);
  return true;
end $$;

create or replace function public.member_favs(p_token text)
returns table(target_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.target_id, f.created_at from public.favorites f
  where f.member_id = (select b.id from public._member_by_token(p_token) b)
  order by f.created_at desc
$$;

-- ---------- 个人主页（谁都能看；匿名投的不列出来） ----------
create or replace function public.member_profile(p_username text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'username', m.username,
    'created_at', m.created_at,
    'approved', (select count(*) from public.submissions s where s.member_id = m.id and s.status = 'approved' and not s.is_anon),
    'items', coalesce((
      select json_agg(x order by x.created_at desc) from (
        select s.id, s.section, s.kind, s.summary, s.event_date, s.image_paths, s.person_id, s.created_at
        from public.submissions s
        where s.member_id = m.id and s.status = 'approved' and not s.is_anon and s.kind in ('upload', 'person')
        order by s.created_at desc limit 200
      ) x), '[]'::json))
  from public.members m where lower(m.username) = lower(btrim(coalesce(p_username, '')))
$$;

-- ---------- 贡献榜（按投稿时间算月份；匿名投的不上榜） ----------
create or replace function public.contrib_board(p_month text default null)
returns table(username text, n bigint)
language sql stable security definer set search_path = '' as $$
  select m.username, count(*) as n
  from public.submissions s join public.members m on m.id = s.member_id
  where s.status = 'approved' and not s.is_anon
    and (p_month is null or to_char(s.created_at at time zone 'Asia/Shanghai', 'YYYY-MM') = p_month)
  group by m.username
  order by count(*) desc, min(s.created_at)
  limit 10
$$;

-- ---------- 消息 ----------
alter table public.members add column if not exists notif_seen_at timestamptz not null default now();

create or replace function public.member_notifications(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_mid uuid; v_seen timestamptz; v_items json;
begin
  select b.id into v_mid from public._member_by_token(p_token) b;
  if v_mid is null then return null; end if;
  select m.notif_seen_at into v_seen from public.members m where m.id = v_mid;
  select coalesce(json_agg(u order by u.at desc), '[]'::json) into v_items from (
    select * from (
      select 'review'::text as type, s.reviewed_at as at, s.id as sid, s.section, s.kind, s.summary, s.status,
             s.review_note as note, null::text as who, null::text as content
        from public.submissions s
        where s.member_id = v_mid and s.reviewed_at is not null and s.status in ('approved', 'rejected')
      union all
      select 'edit_rejected', e.reviewed_at, s.id, s.section, s.kind, s.summary, s.status, e.review_note, null, null
        from public.submission_edits e join public.submissions s on s.id = e.submission_id
        where s.member_id = v_mid and e.status = 'rejected' and e.reviewed_at is not null
      union all
      select 'comment', c.created_at, s.id, s.section, s.kind, s.summary, s.status, null, c.nickname, left(c.content, 80)
        from public.comments c join public.submissions s on s.id = c.target_id
        where s.member_id = v_mid and c.parent_id is null and c.member_id is distinct from v_mid
      union all
      select 'reply', c.created_at, s.id, s.section, s.kind, s.summary, s.status, null, c.nickname, left(c.content, 80)
        from public.comments c join public.submissions s on s.id = c.target_id
        where c.parent_id is not null and c.member_id is distinct from v_mid and (
          (c.reply_to is null and exists (select 1 from public.comments p where p.id = c.parent_id and p.member_id = v_mid))
          or (c.reply_to is not null and exists (
            select 1 from public.comments p
            where (p.id = c.parent_id or p.parent_id = c.parent_id) and p.member_id = v_mid
              and p.nickname = c.reply_to and p.created_at < c.created_at)))
    ) a order by a.at desc limit 50
  ) u;
  return json_build_object('seen_at', v_seen, 'items', v_items);
end $$;

create or replace function public.member_notif_count(p_token text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare r json;
begin
  r := public.member_notifications(p_token);
  if r is null then return null; end if;
  return (select count(*) from json_array_elements(r -> 'items') e
          where (e ->> 'at')::timestamptz > (r ->> 'seen_at')::timestamptz);
end $$;

create or replace function public.member_notif_seen(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.members set notif_seen_at = now()
  where id = (select b.id from public._member_by_token(p_token) b)
$$;

revoke all on function public.member_fav_toggle(text, uuid), public.member_favs(text), public.member_profile(text),
  public.contrib_board(text), public.member_notifications(text), public.member_notif_count(text), public.member_notif_seen(text) from public;
grant execute on function public.member_fav_toggle(text, uuid), public.member_favs(text), public.member_profile(text),
  public.contrib_board(text), public.member_notifications(text), public.member_notif_count(text), public.member_notif_seen(text) to anon, authenticated;
