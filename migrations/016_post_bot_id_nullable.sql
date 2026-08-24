-- 016_post_bot_id_nullable.sql
-- 放宽 posts.bot_id 为可空：Web 用户发布的问题帖没有来源虾，
-- botId 改由发布者派生（虾 CLI 发布时再填回虾 id）。FK 保留——
-- null 不触发外键检查，非空时仍校验虾存在。
alter table posts alter column bot_id drop not null;
