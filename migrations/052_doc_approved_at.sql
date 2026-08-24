-- 052: 记录知识/技能文档的批准时间（审批通过时刻）。
-- 与 rejected_at 同为 text 存 ISO 字符串（北京时间 +08:00，与 reviewed_at / rejected_at 一致）。
-- reviewDoc 审批通过时写入；网页直接发布的已批准文档在 createDoc 时即写入（发布即批准）。
-- 修订分流：已批准文档修订后仍为已批准，沿用原 approved_at；待留意 / 复盘中文档修订后进入
-- 待审核，approved_at 清空（不再批准），再次审批通过时重新写入。
-- 历史已批准文档此列为 null，详情页读取时回退到发布时间展示（不回填，避免把发布时间误当批准时间落库）。
alter table docs add column if not exists approved_at text;
