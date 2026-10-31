-- CR7的小世界：网友账号（只要用户名+密码，不用邮箱）
-- 密码用 bcrypt 加盐存，数据库里只有乱码；表对外完全锁死，只能走下面几个函数
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null,
  pass_hash text not null,
  last_login_at timestamptz,
  constraint members_username_fmt check (username ~ '^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$')
);
-- 用户名不分大小写不能重复（Ronaldo 和 ronaldo 算同一个）
create unique index if not exists members_username_uniq on public.members (lower(username));

create table if not exists public.member_sessions (
  token_hash text primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '180 days'
);
create index if not exists member_sessions_member_idx on public.member_sessions(member_id);

-- 防止有人刷注册、猜密码
create table if not exists public.member_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null,          -- register / login_fail
  ip text,
  username text
);
create index if not exists member_attempts_idx on public.member_attempts(kind, created_at desc);

alter table public.members enable row level security;
alter table public.member_sessions enable row level security;
alter table public.member_attempts enable row level security;
revoke all on public.members, public.member_sessions, public.member_attempts from anon, authenticated;
grant all on public.members, public.member_sessions, public.member_attempts to service_role;
grant usage, select on sequence public.member_attempts_id_seq to service_role;

create or replace function public._member_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function public._member_new_session(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.member_sessions(token_hash, member_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_member);
  delete from public.member_sessions where member_id = p_member and expires_at < now();
  return v_token;
end $$;

-- 注册：成功直接登录，返回 {token, username}
create or replace function public.member_register(p_username text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_username, '')); v_ip text := public._member_ip(); v_id uuid;
begin
  if v_name !~ '^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$' then
    raise exception '用户名要2到16个字，只能用中文、字母、数字和下划线';
  end if;
  if char_length(coalesce(p_password, '')) < 6 or char_length(p_password) > 64 then
    raise exception '密码要6到64位';
  end if;
  if v_ip is not null and (select count(*) from public.member_attempts a
      where a.kind = 'register' and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 5 then
    raise exception '注册太频繁啦，过一会儿再来';
  end if;
  if exists (select 1 from public.members m where lower(m.username) = lower(v_name)) then
    raise exception '这个用户名已经有人用了，换一个吧';
  end if;
  insert into public.members(username, pass_hash)
  values (v_name, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning id into v_id;
  insert into public.member_attempts(kind, ip, username) values ('register', v_ip, v_name);
  update public.members set last_login_at = now() where id = v_id;
  return json_build_object('token', public._member_new_session(v_id), 'username', v_name);
exception when unique_violation then
  raise exception '这个用户名已经有人用了，换一个吧';
end $$;

-- 登录：返回 {token, username}
create or replace function public.member_login(p_username text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_username, '')); v_ip text := public._member_ip(); m record;
begin
  if (select count(*) from public.member_attempts a where a.kind = 'login_fail'
      and (lower(a.username) = lower(v_name) or (v_ip is not null and a.ip = v_ip))
      and a.created_at > now() - interval '10 minutes') >= 10 then
    raise exception '密码输错太多次了，十分钟后再试';
  end if;
  select id, username, pass_hash into m from public.members where lower(username) = lower(v_name);
  if m.id is null or m.pass_hash <> extensions.crypt(coalesce(p_password, ''), m.pass_hash) then
    insert into public.member_attempts(kind, ip, username) values ('login_fail', v_ip, v_name);
    return json_build_object('error', '用户名或密码不对');
  end if;
  update public.members set last_login_at = now() where id = m.id;
  delete from public.member_attempts where created_at < now() - interval '1 day';
  return json_build_object('token', public._member_new_session(m.id), 'username', m.username);
end $$;

-- 用登录口令查自己是谁（口令失效返回 null）
create or replace function public.member_me(p_token text) returns json
language sql security definer set search_path = '' as $$
  select json_build_object('username', m.username, 'created_at', m.created_at)
  from public.member_sessions s join public.members m on m.id = s.member_id
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
$$;

create or replace function public.member_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.member_sessions
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

revoke all on function public._member_ip(), public._member_new_session(uuid) from public, anon, authenticated;
revoke all on function public.member_register(text, text), public.member_login(text, text),
  public.member_me(text), public.member_logout(text) from public;
grant execute on function public.member_register(text, text), public.member_login(text, text),
  public.member_me(text), public.member_logout(text) to anon, authenticated;
