-- CR7的小世界：内容评论区（直接显示，站长可删；一层回复；点赞）
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  target_id uuid not null references public.submissions(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  reply_to text,
  nickname text not null default '匿名罗蜜',
  content text not null,
  like_count int not null default 0,
  owner_token uuid not null,
  ip_hash text,
  constraint comments_content_len check (char_length(btrim(content)) between 1 and 500),
  constraint comments_nick_len check (char_length(nickname) between 1 and 20)
);
create index if not exists comments_target_idx on public.comments(target_id, created_at);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists comments_recent_idx on public.comments(created_at desc);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  liker uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, liker)
);

alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

-- 大家都能看评论，但看不到删除口令和IP指纹
drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments for select to anon, authenticated using (true);
drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete on public.comments for delete to authenticated using ((select public.is_admin()));

revoke all on public.comments from anon, authenticated;
grant select (id, created_at, target_id, parent_id, reply_to, nickname, content, like_count) on public.comments to anon, authenticated;
grant delete on public.comments to authenticated;
revoke all on public.comment_likes from anon, authenticated;
grant all on public.comments, public.comment_likes to service_role;

-- 发评论：只能评审核通过的内容；回复只挂一层；同一IP一分钟最多5条
create or replace function public.add_comment(p_target uuid, p_parent uuid, p_nickname text, p_content text, p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid; v_reply_to text; v_ip text; v_id uuid; v_nick text; v_content text;
begin
  v_content := btrim(coalesce(p_content, ''));
  if char_length(v_content) = 0 then raise exception '评论内容不能为空'; end if;
  if char_length(v_content) > 500 then raise exception '评论最多500字'; end if;
  v_nick := nullif(btrim(coalesce(p_nickname, '')), '');
  v_nick := left(coalesce(v_nick, '匿名罗蜜'), 20);
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
  insert into public.comments(target_id, parent_id, reply_to, nickname, content, owner_token, ip_hash)
    values (p_target, v_parent, case when p_parent is not null and p_parent <> v_parent then v_reply_to end, v_nick, v_content, p_token, v_ip)
    returning id into v_id;
  return v_id;
end $$;

-- 点赞/取消：每个浏览器一个随机身份，同一条只能赞一次
create or replace function public.like_comment(p_id uuid, p_liker uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if p_liker is null then raise exception '缺少身份'; end if;
  if exists (select 1 from public.comment_likes l where l.comment_id = p_id and l.liker = p_liker) then
    delete from public.comment_likes where comment_id = p_id and liker = p_liker;
    update public.comments set like_count = greatest(like_count - 1, 0) where id = p_id returning like_count into v_n;
  else
    insert into public.comment_likes(comment_id, liker) values (p_id, p_liker);
    update public.comments set like_count = like_count + 1 where id = p_id returning like_count into v_n;
  end if;
  if v_n is null then raise exception '这条评论不在了'; end if;
  return v_n;
end $$;

-- 删自己的评论：拿着发评论时的口令
create or replace function public.delete_my_comment(p_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.comments where id = p_id and owner_token = p_token;
  return found;
end $$;

revoke all on function public.add_comment(uuid, uuid, text, text, uuid) from public;
revoke all on function public.like_comment(uuid, uuid) from public;
revoke all on function public.delete_my_comment(uuid, uuid) from public;
grant execute on function public.add_comment(uuid, uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.like_comment(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_my_comment(uuid, uuid) to anon, authenticated;
