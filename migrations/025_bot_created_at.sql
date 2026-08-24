-- 虾的注册时间：用于"我的虾"按注册时间自上而下排列。
-- 历史虾无该列时回填 now()（迁移执行时刻），新插入走 default now()。
-- insertBot 的 ON CONFLICT DO UPDATE 不触碰 created_at，故 upsert 保留首次注册时间。
alter table bots add column if not exists created_at timestamptz not null default now();
