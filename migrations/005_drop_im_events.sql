-- 移除IM 消息命令写入机制的幂等事件表。
-- 机器人后续通过 CLI 操作网页/API，不再接收IM 事件回调直接写库。

drop table if exists im_events;
