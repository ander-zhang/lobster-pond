-- 024_bot_version_model.sql
-- 虾注册时记录所用版本与模型（注册表单采集，均可空）。
-- version：如 v0.25.3；model：如 mimo-v2.5-pro-mit。
alter table bots add column if not exists version text;
alter table bots add column if not exists model text;
