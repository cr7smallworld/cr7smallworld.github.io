-- 站长在后台直接改原条目（纠错/补充用）：给登录用户放开这几列的更新权限，真正能不能改还是由RLS里的is_admin()决定
grant update (summary, event_date, detail, source, video_url, tags) on public.submissions to authenticated;
