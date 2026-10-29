-- CR7的小世界 · 精彩二创投稿改版：加分类、来源平台、原作者昵称
-- 在 Supabase → SQL Editor 里整段粘贴，点 Run。重复跑也没关系。

alter table public.submissions add column if not exists fanwork_type     text;
alter table public.submissions add column if not exists fanwork_platform text;
alter table public.submissions add column if not exists fanwork_author   text;

-- 分类只能是这五种
alter table public.submissions drop constraint if exists submissions_fanwork_type_allowed;
alter table public.submissions add constraint submissions_fanwork_type_allowed
  check (fanwork_type is null or fanwork_type in ('混剪', '同人文', '同人图', '修图', '其它'));

alter table public.submissions drop constraint if exists submissions_fanwork_text_len;
alter table public.submissions add constraint submissions_fanwork_text_len check (
  coalesce(char_length(fanwork_platform), 0) <= 30 and coalesce(char_length(fanwork_author), 0) <= 60
);

-- 二创上传：分类、来源平台、原作者昵称三个都必须填（只管以后新投的稿）
alter table public.submissions drop constraint if exists submissions_fanwork_required;
alter table public.submissions add constraint submissions_fanwork_required check (
  not (kind = 'upload' and section = 'fanworks')
  or (fanwork_type is not null
      and coalesce(btrim(fanwork_platform), '') <> ''
      and coalesce(btrim(fanwork_author), '') <> '')
) not valid;

grant select (fanwork_type, fanwork_platform, fanwork_author) on public.submissions to anon, authenticated;
grant insert (fanwork_type, fanwork_platform, fanwork_author) on public.submissions to anon, authenticated;
grant update (fanwork_type, fanwork_platform, fanwork_author) on public.submissions to authenticated;
