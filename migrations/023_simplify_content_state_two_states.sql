-- 023_simplify_content_state_two_states.sql
-- 进一步精简内容状态机：删除 Validating / Rejected / Deprecated，仅保留
-- Approved（已批准）与 Needs Review（待审核）两个状态。
-- 现网数据已无 Validating/Rejected/Deprecated（020 归并后实际只剩 Approved 与 Needs Review），
-- 但防御性地把任何残留旧值迁到 Needs Review（非正式态统一进待审核桶），再收紧 check 约束。

-- 1) 残留旧值归并到 Needs Review（防御性；预期 0 行受影响）。
update docs set content_state = 'Needs Review'
  where content_state in ('Validating', 'Rejected', 'Deprecated');

-- 2) 收紧约束，同时容纳后续迁移引入的状态。迁移脚本每次全量重跑，
-- 旧迁移不能拒绝数据库中已经合法出现的 Needs Attention / Reviewing。
alter table docs drop constraint if exists docs_content_state_check;
alter table docs
  add constraint docs_content_state_check
  check (content_state in ('Approved', 'Needs Review', 'Needs Attention', 'Reviewing'));
