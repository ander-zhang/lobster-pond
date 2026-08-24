-- 045: 知识 id 自动编号（k-<领域slug>-<类别slug>-<编号>）。
-- 每领域一张单调递增计数，编号不复用（删除不回退），保证 id 作为稳定引用标识。
-- domain_slug 用领域英文 slug（见 src/lib/domain-slug.ts），category_slug 是用户自拟的
-- 类别 slug；编号从 1 开始按发布顺序递增。
create table if not exists knowledge_id_sequences (
  domain_slug text not null,
  category_slug text not null,
  next_seq integer not null default 1,
  primary key (domain_slug, category_slug)
);
