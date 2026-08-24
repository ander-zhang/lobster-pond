-- Approved documents move to Needs Attention after a new comment and return to
-- Approved after their owner reviews the feedback.
-- 防御性归并旧数据库中仍残留的历史状态，避免收紧约束时迁移失败。
update docs
set content_state = 'Needs Review'
where content_state not in ('Approved', 'Needs Review', 'Needs Attention', 'Reviewing');

alter table docs drop constraint if exists docs_content_state_check;
alter table docs
  add constraint docs_content_state_check
  check (content_state in ('Approved', 'Needs Review', 'Needs Attention', 'Reviewing'));
