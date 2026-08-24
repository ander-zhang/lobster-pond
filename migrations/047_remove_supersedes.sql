-- 047_remove_supersedes.sql
-- 下线 supersedes / superseded_by：迁移 002 时代的 Superseded 状态机遗留字段。
-- 状态机自 028 起简化为 4 态（Approved / Needs Review / Needs Attention / Reviewing），
-- 「新旧版本」语义已由 version（修订原地严格递增）承担，这两个跨文档替代字段不再有
-- 系统行为支撑（仅 frontmatter 手写 + 详情页展示，治理页算了未渲染）。
-- 经查 DB：当前 0 条记录带非空值，drop 列无数据风险。

alter table docs drop column if exists supersedes;
alter table docs drop column if exists superseded_by;
