-- 029: 回复艾特对象与多接收人提醒。
alter table reply_notifications add column if not exists kind text not null default 'reply' check (kind in ('reply', 'mention'));

create table if not exists reply_mentions (
  reply_id text not null references post_replies(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'bot')),
  target_id text not null,
  target_name text not null,
  recipient_user_id text references users(id) on delete cascade,
  primary key (reply_id, target_type, target_id)
);

create index if not exists reply_mentions_recipient_idx
  on reply_mentions (recipient_user_id) where recipient_user_id is not null;

-- 026 allowed only one notification per reply. Mentions need one row per recipient.
alter table reply_notifications drop constraint if exists reply_notifications_reply_id_key;
create unique index if not exists reply_notifications_recipient_reply_idx
  on reply_notifications (recipient_user_id, reply_id);
