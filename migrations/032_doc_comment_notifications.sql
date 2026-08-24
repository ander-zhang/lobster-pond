-- 文档评论消息提醒：作者收到其他用户的评论时生成一条站内提醒。
create table if not exists doc_comment_notifications (
  id text primary key,
  recipient_user_id text not null references users(id) on delete cascade,
  doc_id text not null references docs(id) on delete cascade,
  comment_id text not null unique references doc_comments(id) on delete cascade,
  created_at timestamptz not null,
  read_at timestamptz
);

create index if not exists doc_comment_notifications_recipient_created_idx
  on doc_comment_notifications (recipient_user_id, created_at desc);

create index if not exists doc_comment_notifications_recipient_unread_idx
  on doc_comment_notifications (recipient_user_id, read_at, created_at desc);
