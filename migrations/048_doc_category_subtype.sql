-- 048: 知识三级分类落库。为 docs 增加 category（种别）/ subtype（类型）两列，
-- 存量文档（知识 + 技能）统一回填 category='经验'、subtype=null。
-- knowledge_id_sequences 计数键扩展为 (domain_slug, category_slug, subtype_slug)，
-- 支持新 id 格式 <领域slug>-<种别slug>-<类型slug>-<编号>（经验用 experience 段）。
--
-- 迁移已由 migrations 跟踪表保证 run-once（见 scripts/migrate.ts），故无需 DO 块防重；
-- 且本项目的 splitSql 按「;+换行」切分、不识别 $$ 美元引用，DO $$…$$ 会被切碎——
-- 因此统一用可被 splitSql 正确切分的单语句：drop constraint if exists + add constraint。

-- docs 加列。
alter table docs add column if not exists category text;
alter table docs add column if not exists subtype text;

-- 存量回填：所有现有行归入「经验」，无三级类型。
update docs set category = '经验' where category is null;

-- 回填后 category 非空；subtype 允许 null（经验 / 技能本就无类型）。
alter table docs alter column category set not null;

-- 计数表主键扩展：新增 subtype_slug（默认 experience，兼容旧序列行），
-- 主键从 (domain_slug, category_slug) 改为三元组。旧序列行的 subtype_slug 落为 experience。
alter table knowledge_id_sequences
  add column if not exists subtype_slug text not null default 'experience';

alter table knowledge_id_sequences drop constraint if exists knowledge_id_sequences_pkey;

alter table knowledge_id_sequences
  add constraint knowledge_id_sequences_pkey
  primary key (domain_slug, category_slug, subtype_slug);
