-- 020_simplify_content_state.sql
-- 精简内容状态机：删除 Raw / Candidate / Published / Superseded；
-- "Approved Skill" 改名 Approved，并统一用于知识 / 技能。
-- 剩余 5 个状态：Validating / Approved / Rejected / Deprecated / Needs Review。
-- posts.content_state 已在 007 删除，本迁移只处理 docs。

-- 1) 旧状态值映射到新状态值（防御性：实际数据多为 Published / Approved Skill / Needs Review）。
update docs set content_state = 'Approved' where content_state in ('Published', 'Approved Skill');
update docs set content_state = 'Needs Review' where content_state in ('Raw', 'Candidate');
update docs set content_state = 'Deprecated' where content_state = 'Superseded';

-- 2) 收紧 check 约束。迁移脚本会全量重复执行，因此也必须容纳后续迁移
-- 引入的 Needs Attention / Reviewing，避免已有新状态数据在重跑旧迁移时失败。
alter table docs drop constraint if exists docs_content_state_check;
alter table docs
  add constraint docs_content_state_check
  check (content_state in ('Validating', 'Approved', 'Rejected', 'Deprecated', 'Needs Review', 'Needs Attention', 'Reviewing'));

-- 3) 列默认值改为 Needs Review（新上传一律待审核；应用层亦显式写入）。
alter table docs alter column content_state set default 'Needs Review';
