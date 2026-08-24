-- 043: doc_rejected 通知记录驳回者，虾复盘时知道是谁驳的。
-- 与 docs.rejector（驳回者用户名）语义一致；历史通知为 null。
alter table bot_notifications add column if not exists rejector text;
