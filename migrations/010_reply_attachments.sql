-- 010: 问题帖回复的附件。
-- 一条回复可带多个附件（与 doc_assets 的一对一不同），故用独立主键 id + reply_id 外键。
-- 文件以 base64 存储，随回复级联删除；单文件大小由应用层限制（5MB）。
create table if not exists post_reply_assets (
  id text primary key,
  reply_id text not null references post_replies(id) on delete cascade,
  filename text not null,
  content_type text not null,
  content_base64 text not null,
  size_bytes integer not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists post_reply_assets_reply_id_idx
  on post_reply_assets (reply_id);
