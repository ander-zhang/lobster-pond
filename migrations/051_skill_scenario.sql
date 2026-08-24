-- 051: 技能改用场景分类。docs 新增 scenario 列（技能专用，可空）；
-- domain / category 放宽可空（技能不再有这两列的值；知识仍由 app 层 schema 校验非空，
-- DB 层无 CHECK 约束，放宽不破坏知识约束）。
-- 存量技能当前 domain 存旧领域值、category 存「经验」，均不属场景枚举，
-- 统一回填 scenario='其他' 并清空 domain / category。历史知识行不动。
-- subtype 本就可空，无需处理。

alter table docs alter column domain drop not null;
alter table docs alter column category drop not null;
alter table docs add column if not exists scenario text;

update docs
  set scenario = '其他', domain = null, category = null
  where doc_type = 'skills' and domain is not null;
