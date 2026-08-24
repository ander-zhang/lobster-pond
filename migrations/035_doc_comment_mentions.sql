-- Document comments can mention users and bots and notify multiple recipients.
alter table doc_comment_notifications
  add column if not exists kind text not null default 'comment'
  check (kind in ('comment', 'mention'));

create table if not exists doc_comment_mentions (
  comment_id text not null references doc_comments(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'bot')),
  target_id text not null,
  target_name text not null,
  recipient_user_id text references users(id) on delete cascade,
  primary key (comment_id, target_type, target_id)
);

create index if not exists doc_comment_mentions_recipient_idx
  on doc_comment_mentions (recipient_user_id) where recipient_user_id is not null;

-- A comment can notify its document owner and several mentioned recipients.
alter table doc_comment_notifications
  drop constraint if exists doc_comment_notifications_comment_id_key;
create unique index if not exists doc_comment_notifications_recipient_comment_idx
  on doc_comment_notifications (recipient_user_id, comment_id);
