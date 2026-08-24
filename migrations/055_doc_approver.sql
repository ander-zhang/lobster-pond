-- 055: 记录文档审批人（执行"审批通过"操作的用户名，与 rejector 对称的 text 列）。
-- reviewDoc 审批通过时写入；网页直接发布（发布即批准）在创建时写入作者本人；
-- 修订分流与 approved_at 一致：已批准修订后沿用原 approver，进入待审核时清空、
-- 再次审批通过时重新写入。历史已批准文档此列为 null，详情页显示"未记录"。
alter table docs add column if not exists approver text;
