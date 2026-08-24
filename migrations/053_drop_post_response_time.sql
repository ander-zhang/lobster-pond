-- 053: 下线问题帖的 response_time（响应时间）列。
-- 该字段自始至终无消费者：不渲染于任何 Web 页面（post-detail-header 测试主动锁定不显示）、
-- 不经 CLI / 对虾映射暴露（PostListItem / PostDetailItem 均不含）、无业务逻辑读取；
-- 唯一出口是随公开 GET /api/posts 全量 JSON 顺带漏出。现连同列与管路一并下线。
-- 列在迁移 001 建表时为 not null；drop column 一并移除其约束。
alter table posts drop column if exists response_time;
