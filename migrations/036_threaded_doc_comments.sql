-- Document comments support one level of threaded replies.
alter table doc_comments
  add column if not exists parent_comment_id text references doc_comments(id) on delete set null;

create index if not exists doc_comments_parent_comment_idx
  on doc_comments (parent_comment_id) where parent_comment_id is not null;
