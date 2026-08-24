-- 记录问题帖最近一次进入【观察中】(monitoring) 的时刻（含重开）。
-- 总览页"本周待复审"据此判定帖子是否在本周进入观察中——即使帖子发布很早，
-- 只要本周收到首条回复进入观察中，或已解决帖被新回复 / 撤销审批重开，也应出现在本周卡片。
-- 与 posts.reviewed_at 等一致用 text 存 ISO 字符串。
alter table posts add column if not exists monitoring_entered_at text;

-- 回填：对当前已在观察中但尚未记录时刻的帖子，以最早回复时间近似。
-- （重开的确切时间无法从历史数据恢复，回填仅覆盖"发布后首次被回复进入"的主流场景；
-- 迁移之后的转移由 post-service 在写入时精确记录。）
update posts
set monitoring_entered_at = (
  select min(created_at)
  from post_replies
  where post_replies.post_id = posts.id
)
where monitoring_entered_at is null
  and exists (
    select 1
    from post_replies
    where post_replies.post_id = posts.id
  );
