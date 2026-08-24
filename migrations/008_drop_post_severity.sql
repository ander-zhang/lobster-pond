-- 008_drop_post_severity.sql
-- 取消问题帖的难度划分（易/中/难）。severity 列唯一用途是产出难度标签，
-- 现已连同相关 UI、表单、图表和文档一并移除。
alter table posts drop column if exists severity;
