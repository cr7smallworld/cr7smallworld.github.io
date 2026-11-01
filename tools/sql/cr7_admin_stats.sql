alter table public.submissions drop constraint submissions_fanwork_type_allowed;
alter table public.submissions add constraint submissions_fanwork_type_allowed check (fanwork_type is null or fanwork_type = any (array['混剪','同人文','同人图','修图','表情包','其它','西装杀','肌肉暴击','球场名场面','训练日常']));

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not (select public.is_admin()) then raise exception 'not admin'; end if;
  with days as (
    select generate_series((now() at time zone 'Asia/Shanghai')::date - 6, (now() at time zone 'Asia/Shanghai')::date, interval '1 day')::date d
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'approved', (select count(*) from submissions where status = 'approved'),
      'pending',  (select count(*) from submissions where status = 'pending'),
      'members',  (select count(*) from members),
      'comments', (select count(*) from comments),
      'favorites',(select count(*) from favorites)),
    'sections', (select coalesce(jsonb_object_agg(section, n), '{}'::jsonb) from (
      select section, count(*) n from submissions where status = 'approved' and kind in ('upload','person') group by section) s),
    'days', (select jsonb_agg(jsonb_build_object('d', d,
      'subs',     (select count(*) from submissions where (created_at at time zone 'Asia/Shanghai')::date = d),
      'members',  (select count(*) from members     where (created_at at time zone 'Asia/Shanghai')::date = d),
      'comments', (select count(*) from comments    where (created_at at time zone 'Asia/Shanghai')::date = d)) order by d) from days),
    'topComments', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select s.id, s.section, s.kind, s.summary, count(*) n from comments c join submissions s on s.id = c.target_id
      group by s.id order by n desc limit 5) x),
    'topFavs', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select s.id, s.section, s.kind, s.summary, count(*) n from favorites f join submissions s on s.id = f.target_id
      group by s.id order by n desc limit 5) x)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
