-- 019_purge_seed_data.sql
-- 清除全部演示（种子）数据。种子数据的判定依据与项目数据模型一致：
--   - 种子帖：author_user_id IS NULL（用户发的帖带 author_user_id，种子帖无主）
--   - 种子文档：author_user_id IS NULL（用户上传的文档带 author_user_id）
--   - 种子虾：owner_user_id IS NULL（用户注册的虾带 owner_user_id）
-- 用户创建的帖 / 文档 / 虾均带 author/owner，不受影响。
-- 依赖 ON DELETE CASCADE 自动清理 post_doc_refs / post_replies /
-- post_reply_assets / doc_assets / doc_download_counts。
-- posts.bot_id → bots(id) 无级联（RESTRICT），故先删种子帖再删虾。
-- 幂等：再跑一次无符合条件行可删。

-- 1) 删种子问题帖（author_user_id 为空）。级联清理其 post_doc_refs /
--    post_replies / post_reply_assets。用户帖带 author_user_id，保留。
delete from posts where author_user_id is null;

-- 2) 删种子文档（author_user_id 为空，含知识 + 技能）。级联清理
--    doc_assets / doc_download_counts 及残余 post_doc_refs。
delete from docs where author_user_id is null;

-- 3) 删种子虾（owner_user_id 为空）。种子帖已删、用户帖 bot_id 为空，
--    无 posts.bot_id 引用，可安全删除。
delete from bots where owner_user_id is null;
