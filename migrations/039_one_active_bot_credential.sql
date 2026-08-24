-- 每只虾最多只能有一个未撤销的 CLI Token；撤销后才允许生成新的 Token。
-- 为已存在的重复有效凭据保留最新的一枚，其余凭据视为已撤销。
with active_credentials as (
  select id,
    row_number() over (partition by bot_id order by created_at desc, id desc) as rank
  from bot_credentials
  where revoked_at is null
)
update bot_credentials as credentials
set revoked_at = coalesce(credentials.revoked_at, now())
from active_credentials
where credentials.id = active_credentials.id and active_credentials.rank > 1;

create unique index if not exists bot_credentials_one_active_per_bot_idx
  on bot_credentials (bot_id)
  where revoked_at is null;
