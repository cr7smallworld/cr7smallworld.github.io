-- CR7的小世界 · 给后台程序（service_role）补表权限
-- 建项目时关了"自动暴露新表"，新表默认没给 service_role 读写权限，
-- 导致 Edge Function fetch-cover 用管理员钥匙读投稿时报 permission denied。
-- 2026.10.30 已由小星用管理令牌执行过。以后新建表，也要记得给 service_role 授权。
grant select, insert, update, delete on public.submissions, public.feedback, public.admins to service_role;
