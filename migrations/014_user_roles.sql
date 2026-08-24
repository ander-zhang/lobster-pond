-- 014: 用户角色。区分普通成员与管理员：删帖/删文档/删机器人/审核等破坏性或
-- 治理性动作仅管理员可执行（见 delete-service / post-service 的 requireAdmin）。
-- 历史用户默认 member；把最早注册的用户提升为 admin 作为首次部署的自举入口，
-- 后续 registerUser 在无用户时也会发 admin（见 auth-service.registerUser）。
alter table users
  add column if not exists role text not null default 'member'
    check (role in ('member', 'admin'));

update users
  set role = 'admin'
  where id = (
    select id from users order by created_at asc limit 1
  );
