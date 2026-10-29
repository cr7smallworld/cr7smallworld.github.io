-- CR7的小世界 · 给站长留言
-- 在 Supabase → SQL Editor 里整段粘贴，点 Run。重复跑也没关系。
--
-- 网友：只能往里交留言，自己的别人的都看不到；凭查询码只能看到自己那条的状态和站长回复
-- 站长：能看全部、标已读、写回复、删除

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  token       uuid not null unique,
  category    text not null default 'other' check (category in ('suggestion', 'problem', 'other')),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  nickname    text check (nickname is null or char_length(nickname) <= 30),
  status      text not null default 'unread' check (status in ('unread', 'read')),
  reply       text check (reply is null or char_length(reply) <= 1000),
  replied_at  timestamptz
);

create index if not exists feedback_created_idx on public.feedback(created_at desc);

alter table public.feedback enable row level security;

-- 先把默认权限全收回，再一样一样给
revoke all on public.feedback from anon, authenticated;
grant insert (token, category, message, nickname) on public.feedback to anon, authenticated;
grant select, update, delete on public.feedback to authenticated;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to anon, authenticated
  with check (status = 'unread' and reply is null and replied_at is null);

drop policy if exists feedback_admin_select on public.feedback;
create policy feedback_admin_select on public.feedback
  for select to authenticated using (public.is_admin());

drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete to authenticated using (public.is_admin());

-- 网友凭查询码看自己留言的状态和回复
create or replace function public.check_feedback(p_tokens uuid[])
returns table (token uuid, created_at timestamptz, category text, message text, status text, reply text, replied_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.token, f.created_at, f.category, f.message, f.status, f.reply, f.replied_at
  from public.feedback f
  where f.token = any(p_tokens[1:50]);
$$;

revoke all on function public.check_feedback(uuid[]) from public;
grant execute on function public.check_feedback(uuid[]) to anon, authenticated;
