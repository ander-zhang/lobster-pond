-- 056: 清理问题帖驳回废弃后的 schema 残留。
-- 问题帖驳回已废弃（无 reviewing / 复盘中状态），迁移 028 为 posts 加的三个驳回
-- 审计列（rejected_at / rejector / rejection_reason）自加入起无代码写入、无代码
-- 读取（docs 表的同名列属文档驳回活功能，保留不动）。连同 posts_status_check
-- 中废弃的 'reviewing' 状态口子与 posts_rejection_audit_check 一并下线。
-- 历史代码从未向 posts 写过驳回审计（写入仅发生于 docs），drop 不丢数据；
-- 手工 SQL 写入过 'reviewing' 的极端情况归一为 monitoring——被驳回帖无
-- reviewed_at，有回复时派生状态本就是 monitoring，语义一致。
update posts set status = 'monitoring' where status = 'reviewing';
alter table posts drop constraint if exists posts_rejection_audit_check;
alter table posts drop column if exists rejected_at;
alter table posts drop column if exists rejector;
alter table posts drop column if exists rejection_reason;
alter table posts drop constraint if exists posts_status_check;
alter table posts
  add constraint posts_status_check
  check (status in ('open', 'monitoring', 'resolved'));
