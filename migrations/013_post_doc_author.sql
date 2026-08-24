-- 013: 帖子/文档绑定发布者用户。历史数据无主，列为 null（与 012 回复一致）。
-- on delete set null：用户删除后其内容保留但变无主，避免级联删历史。
alter table posts
  add column if not exists author_user_id text references users(id) on delete set null;

alter table docs
  add column if not exists author_user_id text references users(id) on delete set null;

create index if not exists posts_author_user_id_idx on posts (author_user_id);
create index if not exists docs_author_user_id_idx  on docs  (author_user_id);
