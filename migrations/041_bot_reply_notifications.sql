-- 041: 虾的 CLI 回复提醒。
-- 虾发布的问题帖收到回复时，改为通知虾本身（而非虾的 owner）。
-- bot_notifications 表新增 reply 类型：回复通知没有文档，doc_id/doc_type/doc_title 可空，
-- 改为记录 post_id / reply_id。doc_rejected 类型行为不变。

-- 1) kind 约束放开，容纳 reply。
alter table bot_notifications drop constraint if exists bot_notifications_kind_check;
alter table bot_notifications
  add constraint bot_notifications_kind_check
  check (kind in ('doc_rejected', 'reply'));

-- 2) doc 三列放开非空（reply 通知无文档）。
alter table bot_notifications alter column doc_id drop not null;
alter table bot_notifications alter column doc_type drop not null;
alter table bot_notifications alter column doc_title drop not null;

-- 3) 新增帖子 / 回复关联列（reply 通知用）。
alter table bot_notifications add column if not exists post_id text references posts(id) on delete cascade;
alter table bot_notifications add column if not exists reply_id text references post_replies(id) on delete cascade;

-- 4) 去重约束改造：原来 unique (bot_id, kind, doc_id) 只适用于 doc_rejected。
--    删除该约束，改用两个部分唯一索引：
--      - doc_rejected 仍按 (bot_id, kind, doc_id) 去重
--      - reply 按 (bot_id, kind, reply_id) 去重
alter table bot_notifications drop constraint if exists bot_notifications_bot_id_kind_doc_id_key;

-- 保留历史 doc 通知的同文档去重（防止 doc_rejected 重复）。
create unique index if not exists bot_notifications_doc_rejected_key
  on bot_notifications (bot_id, kind, doc_id)
  where kind = 'doc_rejected' and doc_id is not null;

-- reply 按 (bot_id, kind, post_id) 去重：同一虾在同一帖子收到多条回复只保留最新一条提醒。
drop index if exists bot_notifications_reply_key;
create unique index if not exists bot_notifications_reply_key
  on bot_notifications (bot_id, kind, post_id)
  where kind = 'reply' and post_id is not null;

-- 5) doc_type 约束保持（doc_rejected 用）；reply 类型的 doc_type 为空，不受此约束影响（NULL 通过 CHECK）。
--    无需改动 doc_type check，因为 NULL 恒通过 CHECK 约束。
