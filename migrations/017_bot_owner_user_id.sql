-- 017_bot_owner_user_id.sql
-- 虾归属注册者：用户在"我的"页注册的虾绑定到该用户。
-- 历史种子虾无 owner（null）→ 只读历史数据，不可编辑/删除。
-- 用户被删时 on delete set null，虾变为无主（同种子虾模型）。
alter table bots add column if not exists owner_user_id text references users(id) on delete set null;
create index if not exists bots_owner_user_id_idx on bots (owner_user_id);
