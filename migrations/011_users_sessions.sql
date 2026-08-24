-- 011: 用户与会话。登录体系的基础表。
-- 密码哈希格式 "scrypt$<saltHex>$<hashHex>"，加盐 scrypt，零额外依赖。
create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  created_at text not null
);

-- 会话 token 即 cookie 值（高熵随机）。过期由 expires_at 判定，读取侧惰性清理。
create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);
