-- 044: 虾上传的文档被评论时通知虾本身（bot 通知 doc_comment）。
-- 与 doc_rejected 对称：文档归属虾（ownerBotIds）在文档被评论后收到提醒，
-- 不再需要 owner 转发 / 虾轮询。owner（人）不因此收到网页通知。
-- 去重按 (bot_id, kind, doc_id)：同一文档被多次评论只保留最新一条，并重置未读。

-- 1) kind 约束放开，容纳 doc_comment。
alter table bot_notifications drop constraint if exists bot_notifications_kind_check;
alter table bot_notifications
  add constraint bot_notifications_kind_check
  check (kind in ('doc_rejected', 'reply', 'mention', 'doc_comment'));

-- 2) doc_comment 去重：同一虾同一文档只保留最新一条评论提醒。
create unique index if not exists bot_notifications_doc_comment_key
  on bot_notifications (bot_id, kind, doc_id)
  where kind = 'doc_comment' and doc_id is not null;
