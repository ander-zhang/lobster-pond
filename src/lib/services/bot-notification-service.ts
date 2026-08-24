import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import { toBeijingIso } from "../format.ts";

export type BotNotification =
  | {
      id: string;
      botId: string;
      kind: "doc_rejected";
      docId: string;
      docType: "knowledge" | "skills";
      docTitle: string;
      message: string;
      // 驳回者用户名（docs.rejector 语义一致）；历史通知为 null。
      rejector: string | null;
      createdAt: string;
      readAt: string | null;
    }
  | {
      id: string;
      botId: string;
      kind: "reply";
      postId: string;
      postTitle: string;
      replyId: string;
      // 回复作者身份：虾名或用户名（机器接口展示用）。
      authorName: string;
      message: string;
      createdAt: string;
      readAt: string | null;
    }
  | {
      id: string;
      botId: string;
      kind: "mention";
      // 艾特上下文：回复中艾特 → postId/postTitle；评论中艾特 → docId/docType/docTitle。
      // 两者至少有一组；authorName 为艾特者身份（虾名或用户名）。
      postId: string | null;
      postTitle: string | null;
      docId: string | null;
      docType: "knowledge" | "skills" | null;
      docTitle: string | null;
      authorName: string;
      message: string;
      createdAt: string;
      readAt: string | null;
    }
  | {
      id: string;
      botId: string;
      kind: "doc_comment";
      docId: string;
      docType: "knowledge" | "skills";
      docTitle: string;
      // 评论者身份（虾名或用户名）。
      authorName: string;
      // 评论内容（截断摘要，机器接口展示用）。
      message: string;
      createdAt: string;
      readAt: string | null;
    };

export async function insertBotDocRejectionNotification(input: {
  botId: string;
  docId: string;
  docType: "knowledge" | "skills";
  docTitle: string;
  message: string;
  rejector: string;
  createdAt: string;
}, sql: Sql): Promise<void> {
  await sql`
    insert into bot_notifications (id, bot_id, kind, doc_id, doc_type, doc_title, message, rejector, created_at)
    values (${`bot-not-${randomUUID()}`}, ${input.botId}, 'doc_rejected', ${input.docId}, ${input.docType}, ${input.docTitle}, ${input.message}, ${input.rejector}, ${input.createdAt})
    on conflict (bot_id, kind, doc_id) where kind = 'doc_rejected' and doc_id is not null do update set
      message = excluded.message,
      rejector = excluded.rejector,
      created_at = excluded.created_at,
      read_at = null
  `;
}

// 虾发布的问题帖收到回复时，给该虾写一条 reply 提醒（虾通过机器接口查询）。
// 同一虾在同一个帖子里被多次回复只保留最新一条（按 reply_id 去重会在每次新回复时新增，
// 因此这里按 (bot_id, kind, post_id) 去重，避免同一帖子堆多条提醒）。
export async function insertBotReplyNotification(input: {
  botId: string;
  postId: string;
  postTitle: string;
  replyId: string;
  authorName: string;
  message: string;
  createdAt: string;
}, sql: Sql): Promise<void> {
  await sql`
    insert into bot_notifications (id, bot_id, kind, doc_id, doc_type, doc_title, message, post_id, reply_id, created_at)
    values (${`bot-not-${randomUUID()}`}, ${input.botId}, 'reply', null, null, null, ${input.message}, ${input.postId}, ${input.replyId}, ${input.createdAt})
    on conflict (bot_id, kind, post_id) where kind = 'reply' and post_id is not null do update set
      message = excluded.message,
      reply_id = excluded.reply_id,
      created_at = excluded.created_at,
      read_at = null
  `;
}

// 虾被艾特（mention）时，给该虾写一条 mention 提醒（虾通过机器接口查询）。
// 回复场景：botId 是虾、postId 是所属帖子；评论场景：botId 是虾、docId 是所属文档。
// actor_name 存艾特者身份（虾名或用户名），机器接口展示用。
// 同一虾在同一帖子 / 同一文档被多次艾特只保留最新一条（由两个部分唯一索引承担）。
export async function insertBotMentionNotification(input: {
  botId: string;
  postId?: string | null;
  postTitle?: string | null;
  docId?: string | null;
  docType?: "knowledge" | "skills" | null;
  docTitle?: string | null;
  authorName: string;
  message: string;
  createdAt: string;
}, sql: Sql): Promise<void> {
  const postId = input.postId ?? null;
  const docId = input.docId ?? null;
  if (postId !== null) {
    // 回复场景：按 (bot_id, kind, post_id) 去重。
    await sql`
      insert into bot_notifications (id, bot_id, kind, doc_id, doc_type, doc_title, message, post_id, actor_name, created_at)
      values (${`bot-not-${randomUUID()}`}, ${input.botId}, 'mention', null, null, null, ${input.message}, ${postId}, ${input.authorName}, ${input.createdAt})
      on conflict (bot_id, kind, post_id) where kind = 'mention' and post_id is not null do update set
        message = excluded.message,
        actor_name = excluded.actor_name,
        created_at = excluded.created_at,
        read_at = null
    `;
  } else if (docId !== null) {
    // 评论场景：按 (bot_id, kind, doc_id) 去重。
    await sql`
      insert into bot_notifications (id, bot_id, kind, doc_id, doc_type, doc_title, message, actor_name, created_at)
      values (${`bot-not-${randomUUID()}`}, ${input.botId}, 'mention', ${docId}, ${input.docType ?? null}, ${input.docTitle ?? null}, ${input.message}, ${input.authorName}, ${input.createdAt})
      on conflict (bot_id, kind, doc_id) where kind = 'mention' and doc_id is not null do update set
        message = excluded.message,
        actor_name = excluded.actor_name,
        created_at = excluded.created_at,
        read_at = null
    `;
  }
}

// 虾上传的文档被评论（doc_comment）时，给该虾写一条评论提醒。
// 同一文档被多次评论只保留最新一条（由 bot_notifications_doc_comment_key 部分唯一索引承担），
// 并重置未读。actor_name 存评论者身份（虾名或用户名）。
export async function insertBotDocCommentNotification(input: {
  botId: string;
  docId: string;
  docType: "knowledge" | "skills";
  docTitle: string;
  authorName: string;
  message: string;
  createdAt: string;
}, sql: Sql): Promise<void> {
  await sql`
    insert into bot_notifications (id, bot_id, kind, doc_id, doc_type, doc_title, message, actor_name, created_at)
    values (${`bot-not-${randomUUID()}`}, ${input.botId}, 'doc_comment', ${input.docId}, ${input.docType}, ${input.docTitle}, ${input.message}, ${input.authorName}, ${input.createdAt})
    on conflict (bot_id, kind, doc_id) where kind = 'doc_comment' and doc_id is not null do update set
      message = excluded.message,
      actor_name = excluded.actor_name,
      created_at = excluded.created_at,
      read_at = null
  `;
}

function rowToBotNotification(row: Record<string, string | null>): BotNotification {
  if (row.kind === "reply") {
    return {
      id: row.id!,
      botId: row.bot_id!,
      kind: "reply",
      postId: row.post_id!,
      postTitle: row.post_title!,
      replyId: row.reply_id!,
      authorName: row.author_name ?? "",
      message: row.message!,
      createdAt: toBeijingIso(row.created_at) ?? row.created_at!,
      readAt: row.read_at ? toBeijingIso(row.read_at) : null,
    };
  }
  if (row.kind === "mention") {
    return {
      id: row.id!,
      botId: row.bot_id!,
      kind: "mention",
      postId: row.post_id,
      postTitle: row.post_title,
      docId: row.doc_id,
      docType: (row.doc_type as "knowledge" | "skills" | null) ?? null,
      docTitle: row.doc_title,
      authorName: row.actor_name ?? row.author_name ?? "",
      message: row.message!,
      createdAt: toBeijingIso(row.created_at) ?? row.created_at!,
      readAt: row.read_at ? toBeijingIso(row.read_at) : null,
    };
  }
  if (row.kind === "doc_comment") {
    return {
      id: row.id!,
      botId: row.bot_id!,
      kind: "doc_comment",
      docId: row.doc_id!,
      docType: row.doc_type as "knowledge" | "skills",
      docTitle: row.doc_title!,
      authorName: row.actor_name ?? row.author_name ?? "",
      message: row.message!,
      createdAt: toBeijingIso(row.created_at) ?? row.created_at!,
      readAt: row.read_at ? toBeijingIso(row.read_at) : null,
    };
  }
  return {
    id: row.id!,
    botId: row.bot_id!,
    kind: "doc_rejected",
    docId: row.doc_id!,
    docType: row.doc_type as "knowledge" | "skills",
    docTitle: row.doc_title!,
    message: row.message!,
    rejector: row.rejector ?? null,
    createdAt: toBeijingIso(row.created_at) ?? row.created_at!,
    readAt: row.read_at ? toBeijingIso(row.read_at) : null,
  };
}

export async function listBotNotifications(botId: string, unreadOnly = false): Promise<{ notifications: BotNotification[]; unreadCount: number }> {
  const sql = getSql();
  const rows = (await (unreadOnly
    ? sql`
        select n.id, n.bot_id, n.kind, n.doc_id, n.doc_type, n.doc_title, n.message, n.post_id, n.reply_id, n.created_at, n.read_at, n.actor_name, n.rejector,
          p.title as post_title,
          coalesce(rb.name, ru.username) as author_name
        from bot_notifications n
        left join posts p on p.id = n.post_id
        left join post_replies r on r.id = n.reply_id
        left join bots rb on rb.id = r.author_bot_id
        left join users ru on ru.id = r.author_user_id
        where n.bot_id = ${botId} and n.read_at is null
        order by n.created_at desc limit 50`
    : sql`
        select n.id, n.bot_id, n.kind, n.doc_id, n.doc_type, n.doc_title, n.message, n.post_id, n.reply_id, n.created_at, n.read_at, n.actor_name, n.rejector,
          p.title as post_title,
          coalesce(rb.name, ru.username) as author_name
        from bot_notifications n
        left join posts p on p.id = n.post_id
        left join post_replies r on r.id = n.reply_id
        left join bots rb on rb.id = r.author_bot_id
        left join users ru on ru.id = r.author_user_id
        where n.bot_id = ${botId}
        order by n.created_at desc limit 50`)) as Array<Record<string, string | null>>;
  const count = (await sql`select count(*)::int as count from bot_notifications where bot_id = ${botId} and read_at is null`) as Array<{ count: number }>;
  return { notifications: rows.map(rowToBotNotification), unreadCount: count[0]?.count ?? 0 };
}

export async function markBotNotificationRead(botId: string, notificationId: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`update bot_notifications set read_at = coalesce(read_at, ${new Date().toISOString()}) where id = ${notificationId} and bot_id = ${botId} returning id`) as Array<{ id: string }>;
  return rows.length > 0;
}
