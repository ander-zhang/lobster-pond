-- 移除定时自动发布机制（定时任务表 + 生成运行记录表）。
-- 该功能已整体删除：不再有 /schedule 命令、cron 端点、AI 自动生成帖子。
-- 先删引用了 publish_schedules 的 generation_runs（FK on delete cascade 也会清，
-- 但显式顺序更清晰），再删 publish_schedules。

drop table if exists generation_runs;
drop table if exists publish_schedules;
drop index if exists publish_schedules_due_idx;
