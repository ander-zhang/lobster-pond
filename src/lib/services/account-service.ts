import { getSql } from "../db.ts";

// 删除账户及其拥有的虾、内容和凭据。整个清理在一个事务中完成，避免只删掉部分关联数据。
export async function deleteAccount(userId: string): Promise<boolean> {
  const sql = getSql();
  return sql.transaction(async (txn) => {
    const users = (await txn`
      select username from users where id = ${userId} for update
    `) as Array<{ username: string }>;
    const username = users[0]?.username;
    if (!username) return false;

    const ownedBots = (await txn`
      select id from bots where owner_user_id = ${userId}
    `) as Array<{ id: string }>;
    const botIds = ownedBots.map((bot) => bot.id);

    // 帖子删除会级联清理回复、附件、文档引用和通知；bot_id 没有级联，须先删帖再删虾。
    await txn`
      delete from posts
      where author_user_id = ${userId}
         or (${botIds.length > 0} and bot_id = any(${botIds}::text[]))
    `;

    // 清理虾在仍保留帖子中的回复，以及用户本人直接发布的回复。
    await txn`
      delete from post_replies
      where author_user_id = ${userId}
         or (${botIds.length > 0} and author_bot_id = any(${botIds}::text[]))
    `;

    // bot 文档评论的 author_bot_id 是 RESTRICT 外键。先删注销账户及其虾
    // 发布的评论；评论的提及和通知会按外键级联清理，之后删除虾不会受阻。
    await txn`
      delete from doc_comments
      where author_user_id = ${userId}
         or (${botIds.length > 0} and author_bot_id = any(${botIds}::text[]))
    `;

    // 删除本人发布的文档；虾独占的文档也删除，共享文档只移除待注销虾的归属。
    await txn`
      delete from docs
      where author_user_id = ${userId}
         or (
           ${botIds.length > 0}
           and owner_bot_ids ?| ${botIds}
           and not exists (
             select 1
             from jsonb_array_elements_text(owner_bot_ids) as owner_id
             where not (owner_id = any(${botIds}::text[]))
           )
         )
    `;
    if (botIds.length > 0) {
      await txn`
        update docs
        set owner_bot_ids = coalesce(
          (
            select jsonb_agg(owner_id order by ord)
            from jsonb_array_elements_text(owner_bot_ids) with ordinality as owners(owner_id, ord)
            where not (owner_id = any(${botIds}::text[]))
          ),
          '[]'::jsonb
        )
        where owner_bot_ids ?| ${botIds}
      `;
    }

    // 审核人字段是冗余用户名文本，不受 users 外键约束；保留审核记录但移除账户标识。
    await txn`
      update posts
      set reviewer = case when reviewer = ${username} then '已注销用户' else reviewer end,
          rejector = case when rejector = ${username} then '已注销用户' else rejector end
      where reviewer = ${username} or rejector = ${username}
    `;
    await txn`
      update docs
      set rejector = '已注销用户'
      where rejector = ${username}
    `;

    await txn`delete from rate_limit_buckets where key like ${`%:${userId}`}`;
    await txn`delete from bots where owner_user_id = ${userId}`;
    const deleted = (await txn`delete from users where id = ${userId} returning id`) as Array<{ id: string }>;
    return deleted.length > 0;
  });
}
