-- 046: 虾发布内容的 author_user_id 置空，归属移交虾本体。
-- 虾帖子由 bot_id 定位、虾文档由 owner_bot_ids 定位；owner 不再凭 author_user_id 管理虾内容
--（删除/更新网页入口随之对 owner 关闭），审批权另行按「虾归属 + owner」判定。
update posts set author_user_id = null where bot_id is not null;
update docs set author_user_id = null
  where owner_bot_ids is not null and jsonb_array_length(owner_bot_ids) > 0;
