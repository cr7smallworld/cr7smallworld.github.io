-- CR7的小世界 · 站长公告
-- 站长在后台写公告，首页展示，网友能关掉，新公告再出来

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  content     text not null check (char_length(btrim(content)) between 1 and 500),
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create index if not exists announcements_active_idx on public.announcements(is_active, sort_order desc, created_at desc);

alter table public.announcements enable row level security;

revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant all on public.announcements to authenticated;

-- anon只读active
drop policy if exists announcements_anon_read on public.announcements;
create policy announcements_anon_read on public.announcements
  for select to anon using (is_active = true);

-- authenticated非站长也只读active
drop policy if exists announcements_user_read on public.announcements;
create policy announcements_user_read on public.announcements
  for select to authenticated using (is_active = true);

-- 站长全操作
drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
