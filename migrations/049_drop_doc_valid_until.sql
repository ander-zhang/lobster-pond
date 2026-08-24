-- 049: 下线知识/技能文档的 valid_until（有效期）列。
-- 该字段为自由文本「有效期/复审提示」，纯元数据、不触发任何自动行为（不自动失效）；
-- 详情页从不展示，唯一用到它的 governance「过期复审待办」指标是不渲染的死代码。
-- 判定为无效字段，随代码一并下线。幂等：drop column if exists。

alter table docs drop column if exists valid_until;
