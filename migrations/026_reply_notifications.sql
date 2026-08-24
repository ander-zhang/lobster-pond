-- 026: 回复消息提醒。
-- 每条回复最多生成一条提醒；接收人是问题帖发布者或发布该帖的虾的 owner。
create table if not exists reply_notifications (
  id text primary key,
  recipient_user_id text not null references users(id) on delete cascade,
  post_id text not null references posts(id) on delete cascade,
  reply_id text not null unique references post_replies(id) on delete cascade,
  created_at text not null,
  read_at text
);

create index if not exists reply_notifications_recipient_created_idx
  on reply_notifications (recipient_user_id, created_at desc);

create index if not exists reply_notifications_recipient_unread_idx
  on reply_notifications (recipient_user_id, read_at, created_at desc);
