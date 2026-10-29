-- CR7的小世界 · 人物关系改版（人物花名册 + 糖点经历）
-- 在 Supabase → SQL Editor 里整段粘贴，点 Run。重复跑也没关系。
--
-- 做法：人物和糖点都还存在 submissions 表里，照样走投稿 → 审核那一套
--   kind = 'person'  一个人物：summary=名字，detail=简略介绍，tags=所属时期，image_paths[1]=头像
--                    person_role=一句话身份，person_alias=花名/CP名
--   kind = 'upload' 且 section='relations' 且 person_id 有值：挂在这个人物下面的一条糖点经历
--   删除人物时，挂在他下面的糖点一起删掉

alter table public.submissions add column if not exists person_role  text;
alter table public.submissions add column if not exists person_alias text;
alter table public.submissions add column if not exists person_id    uuid
  references public.submissions(id) on delete cascade;

create index if not exists submissions_person_id_idx on public.submissions(person_id);

-- 允许新的投稿类型 person（只换掉原来那条只管 kind 取值的检查，别的检查不动）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.submissions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
      and pg_get_constraintdef(oid) ilike '%upload%'
      and pg_get_constraintdef(oid) not ilike '%target_id%'
      and pg_get_constraintdef(oid) not ilike '%status%'
  loop
    execute format('alter table public.submissions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.submissions drop constraint if exists submissions_kind_allowed;
alter table public.submissions add constraint submissions_kind_allowed
  check (kind in ('upload', 'supplement', 'correction', 'person'));

alter table public.submissions drop constraint if exists submissions_person_rules;
alter table public.submissions add constraint submissions_person_rules check (
  (kind <> 'person' or (section = 'relations' and person_id is null))
  and (person_id is null or (kind = 'upload' and section = 'relations'))
);

alter table public.submissions drop constraint if exists submissions_person_text_len;
alter table public.submissions add constraint submissions_person_text_len check (
  coalesce(char_length(person_role), 0) <= 60 and coalesce(char_length(person_alias), 0) <= 100
);

-- 新加的三列：网友能填、能看（和其他普通列一样）
grant select (person_role, person_alias, person_id) on public.submissions to anon, authenticated;
grant insert (person_role, person_alias, person_id) on public.submissions to anon, authenticated;
grant update (person_role, person_alias, person_id) on public.submissions to authenticated;
