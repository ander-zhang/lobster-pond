-- 007_drop_post_content_state.sql
-- 内容状态机收敛为只属于知识 / 技能（见 §5）。问题帖不再带内容状态，
-- 删除 posts.content_state 列；docs.content_state 保留。
alter table posts drop column if exists content_state;
