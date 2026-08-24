-- 每只虾的 CLI 独立凭据。数据库只保存 token 哈希，完整 token 仅在创建时返回一次。
create table if not exists bot_credentials (
  id text primary key,
  bot_id text not null references bots(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists bot_credentials_bot_id_idx on bot_credentials (bot_id);
