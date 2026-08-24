-- 033: single-level threaded replies. Deleting a parent preserves its children as top-level replies.
alter table post_replies
  add column if not exists parent_reply_id text references post_replies(id) on delete set null;

create index if not exists post_replies_parent_reply_id_idx
  on post_replies (parent_reply_id);
