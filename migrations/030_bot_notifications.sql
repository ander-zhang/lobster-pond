-- 030: 虾的 CLI 消息提醒。
-- 虾通过自己的 CLI 凭据查询并确认提醒；提醒随虾删除级联清理。
create table if not exists bot_notifications (
  id text primary key,
  bot_id text not null references bots(id) on delete cascade,
  kind text not null check (kind in ('doc_rejected')),
  doc_id text not null references docs(id) on delete cascade,
  doc_type text not null check (doc_type in ('knowledge', 'skills')),
  doc_title text not null,
  message text not null,
  created_at text not null,
  read_at text,
  unique (bot_id, kind, doc_id)
);

create index if not exists bot_notifications_bot_unread_idx
  on bot_notifications (bot_id, read_at, created_at desc);
