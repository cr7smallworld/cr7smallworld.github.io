-- CR7的小世界：投稿和评论跟网友账号绑定
-- 登录了：默认显示用户名，可以勾"匿名"；不登录照样能投能评
-- 站长后台能看到匿名的是哪个账号（member_name），前台网友看不到这两列

alter table public.submissions add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.submissions add column if not exists member_name text;
alter table public.submissions add column if not exists is_anon boolean not null default false;
alter table public.submissions add column if not exists member_token text;   -- 只在投稿那一下用，存进去之前就被清空
create index if not exists submissions_member_idx on public.submissions(member_id);

alter table public.comments add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.comments add column if not exists member_name text;
alter table public.comments add column if not exists is_anon boolean not null default false;
create index if not exists comments_member_idx on public.comments(member_id);

-- 用登录口令换出账号（口令失效返回空）
create or replace function public._member_by_token(p_token text)
returns table(id uuid, username text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.username
  from public.member_sessions s join public.members m on m.id = s.member_id
  where p_token is not null and p_token <> ''
    and s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > now()
$$;
revoke all on function public._member_by_token(text) from public, anon, authenticated;

-- 投稿时：网页只交登录口令，账号由数据库自己认，网友没法冒充别人
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
  else
    -- 账号信息投完就锁死，谁改都不行
    new.member_id := old.member_id; new.member_name := old.member_name;
    new.is_anon := old.is_anon; new.member_token := null;
  end if;
  -- 登录投的：署名只能是用户名或者匿名
  if new.member_id is not null then
    new.uploader := case when new.is_anon then null else new.member_name end;
  end if;
  return new;
end $$;
drop trigger if exists submissions_member on public.submissions;
create trigger submissions_member before insert or update on public.submissions
  for each row execute function public._submissions_member();

grant insert (member_token, is_anon) on public.submissions to anon, authenticated;
grant select (member_name, is_anon) on public.submissions to authenticated;   -- 只有站长是 authenticated

-- 评论：多了登录口令和匿名两个参数
drop function if exists public.add_comment(uuid, uuid, text, text, uuid);
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
  insert into public.comments(target_id, parent_id, reply_to, nickname, content, owner_token, ip_hash, member_id, member_name, is_anon)
    values (p_target, v_parent, case when p_parent is not null and p_parent <> v_parent then v_reply_to end,
            v_nick, v_content, p_token, v_ip, v_mid, v_mname, v_mid is not null and coalesce(p_anon, false))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_comment(uuid, uuid, text, text, uuid, text, boolean) from public;
grant execute on function public.add_comment(uuid, uuid, text, text, uuid, text, boolean) to anon, authenticated;
grant select (member_name, is_anon) on public.comments to authenticated;

-- 换手机登录后，把这个账号投过的稿的查询码找回来（"我的投稿"用）
create or replace function public.member_my_submissions(p_token text)
returns table(token uuid, summary text, kind text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.token, s.summary, s.kind, s.created_at
  from public.submissions s
  where s.member_id = (select b.id from public._member_by_token(p_token) b)
  order by s.created_at desc
  limit 50
$$;
revoke all on function public.member_my_submissions(text) from public;
grant execute on function public.member_my_submissions(text) to anon, authenticated;
