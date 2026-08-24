-- 012: 回复绑定发布者用户。历史匿名回复此列为 null（无主），仅管理员可删。
-- on delete set null：用户删除后其回复保留但变无主，避免级联删掉历史内容。
alter table post_replies
  add column if not exists author_user_id text references users(id) on delete set null;

create index if not exists post_replies_author_user_id_idx
  on post_replies (author_user_id);
