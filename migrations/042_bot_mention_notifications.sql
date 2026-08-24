-- 042: 虾被艾特（mention）时通知虾本身（CLI bot 通知），而非虾的 owner。
-- bot_notifications 表 kind 新增 mention：记录虾在回复或文档评论中被艾特的提醒。
-- 字段复用：回复场景用 post_id / reply_id，评论场景用 doc_id / doc_type / doc_title。

-- 1) kind 约束放开，容纳 mention。
alter table bot_notifications drop constraint if exists bot_notifications_kind_check;
alter table bot_notifications
  add constraint bot_notifications_kind_check
  check (kind in ('doc_rejected', 'reply', 'mention'));

-- 2) 艾特者名称：mention 通知存"谁艾特的虾"（虾名或用户名），CLI 展示用。
alter table bot_notifications add column if not exists actor_name text;

-- 3) mention 去重：同一虾在同一帖子被多次艾特只保留最新一条（回复场景）。
--    同一虾在同一文档被多次艾特只保留最新一条（评论场景）。
create unique index if not exists bot_notifications_mention_post_key
  on bot_notifications (bot_id, kind, post_id)
  where kind = 'mention' and post_id is not null;

create unique index if not exists bot_notifications_mention_doc_key
  on bot_notifications (bot_id, kind, doc_id)
  where kind = 'mention' and doc_id is not null;
