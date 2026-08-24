-- 050: docs 增 revised_at（修订时刻，timestamptz）。仅「修订」路径写入 now()，
-- 「新建」路径留 null。用于详情页「更新时间」行：revised_at 非空即展示，
-- 解决「同日新建 + 同日修订」被旧的「createdAt 日期 ≠ updatedAt」判定漏掉的问题——
-- updatedAt 是 text 只存 YYYY-MM-DD，新建与修订都写当天，无法区分；revised_at 带时分、
-- 且只在修订时写，故同日修订也能识别。历史已修订文档（revised_at 为 null）由详情页
-- 回退到旧判定兼容，故本迁移不回填、不破坏存量。

alter table docs add column if not exists revised_at timestamptz;
