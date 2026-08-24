-- 006_simplify_bot_identity.sql
-- 虾的标识信息精简：移除账号 handle、IM 平台、状态、技能、主题色；
-- 角色收敛为"个人虾 / 岗位虾"二选一；新增"主人"字段。
-- 注意：posts.im_platform 是问题帖自身的来源平台列，不在本次范围内，保留。

-- 历史 role 多为自由文本（如"故障路由虾"），这些虾都按职能划分 → 统一归到岗位虾。
update bots set role = '岗位虾' where role not in ('个人虾', '岗位虾');

alter table bots drop column if exists handle;
alter table bots drop column if exists im_platform;
alter table bots drop column if exists status;
alter table bots drop column if exists skills;
alter table bots drop column if exists accent;

-- 主人：个人虾填负责人，岗位虾填所属岗位；历史数据未知，默认空串。
alter table bots add column if not exists master text not null default '';

-- role 原本无约束（自由文本），现收紧为枚举。
alter table bots drop constraint if exists bots_role_check;
alter table bots add constraint bots_role_check check (role in ('个人虾', '岗位虾'));
