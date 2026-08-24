-- 015: 限流共享计数桶。进程内 Map 在 Vercel 多实例 / 冷启动间不共享，登录与
-- 注册的限流形同虚设。改为持久化计数：rateLimit 用 upsert 原子地累加并按窗口
-- 重置，跨实例生效。key 形如 "login:ip:<ip>"。无 DATABASE_URL 时回退进程内计数。
create table if not exists rate_limit_buckets (
  key text primary key,
  count bigint not null,
  reset_at timestamptz not null
);

-- 清理过期桶时按 reset_at 扫描，加索引避免全表扫。
create index if not exists rate_limit_buckets_reset_at_idx
  on rate_limit_buckets (reset_at);
