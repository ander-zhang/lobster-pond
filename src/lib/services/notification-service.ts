import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import type { DocCommentNotification, ReplyNotification, ReviewTransferNotification, SiteNotification } from "../types.ts";

export function replyNotificationRecipient(
  postAuthorUserId: string | null,
  botOwnerUserId: string | null,
  replyAuthorUserId: string | null,
  replyBotOwnerUserId: string | null = null,
): string | null {
  const recipientUserId = postAuthorUserId ?? botOwnerUserId;
  const actorOwnerUserId = replyAuthorUserId ?? replyBotOwnerUserId;
  return recipientUserId && recipientUserId !== actorOwnerUserId ? recipientUserId : null;
}

export function docCommentNotificationRecipient(docAuthorUserId: string | null, commentAuthorUserId: string): string | null {
  return docAuthorUserId && docAuthorUserId !== commentAuthorUserId ? docAuthorUserId : null;
}

export async function insertReplyNotification(
  input: { recipientUserId: string; postId: string; replyId: string; createdAt: string; kind?: "reply" | "mention" },
  sql: Sql,
): Promise<void> {
  await sql`
    insert into reply_notifications (id, recipient_user_id, post_id, reply_id, kind, created_at)
    values (${`not-${randomUUID()}`}, ${input.recipientUserId}, ${input.postId}, ${input.replyId}, ${input.kind ?? "reply"}, ${input.createdAt})
    on conflict (recipient_user_id, reply_id) do nothing
  `;
}

export async function insertDocCommentNotification(
  input: { recipientUserId: string; docId: string; commentId: string; createdAt: string; kind?: "comment" | "mention" },
  sql: Sql,
): Promise<void> {
  await sql`
    insert into doc_comment_notifications (id, recipient_user_id, doc_id, comment_id, kind, created_at)
    values (${`doc-not-${randomUUID()}`}, ${input.recipientUserId}, ${input.docId}, ${input.commentId}, ${input.kind ?? "comment"}, ${input.createdAt})
    on conflict (recipient_user_id, comment_id) do nothing
  `;
}

// 转审提醒：岗位虾 owner 把文档审批权转交给该用户时写入一条（页眉铃铛展示）。
// doc_type / 标题 / 转交者读取时从 docs / users JOIN 派生（与 doc_comment_notifications
// 同模式，不在通知表冗余）。同一用户对同一文档只保留一条（unique 兜底）。
export async function insertReviewTransferNotification(
  input: { recipientUserId: string; docId: string; createdAt: string },
  sql: Sql,
): Promise<void> {
  await sql`
    insert into doc_review_transfer_notifications (id, recipient_user_id, doc_id, kind, created_at)
    values (${`review-not-${randomUUID()}`}, ${input.recipientUserId}, ${input.docId}, 'review_transfer', ${input.createdAt})
    on conflict (recipient_user_id, doc_id) do update set
      created_at = excluded.created_at,
      read_at = null
  `;
}

type ReplyNotificationRow = {
  id: string; post_id: string; post_title: string; reply_id: string; actor_name: string;
  actor_type: "human" | "bot"; kind: "reply" | "mention"; created_at: string | Date; read_at: string | Date | null;
};
type DocCommentNotificationRow = {
  id: string; doc_id: string; doc_type: "knowledge" | "skills"; doc_title: string; comment_id: string;
  actor_name: string; actor_type: "human" | "bot"; kind: "comment" | "mention"; created_at: string | Date; read_at: string | Date | null;
};
type ReviewTransferNotificationRow = {
  id: string; doc_id: string; doc_type: "knowledge" | "skills"; doc_title: string;
  actor_name: string; created_at: string | Date; read_at: string | Date | null;
};

function iso(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToReplyNotification(row: ReplyNotificationRow): ReplyNotification {
  return { id: row.id, targetType: "post", postId: row.post_id, postTitle: row.post_title, replyId: row.reply_id, actorName: row.actor_name, actorType: row.actor_type, kind: row.kind, createdAt: iso(row.created_at)!, readAt: iso(row.read_at) };
}

function rowToDocCommentNotification(row: DocCommentNotificationRow): DocCommentNotification {
  return { id: row.id, targetType: "doc", docId: row.doc_id, docType: row.doc_type, docTitle: row.doc_title, commentId: row.comment_id, actorName: row.actor_name, actorType: row.actor_type, kind: row.kind, createdAt: iso(row.created_at)!, readAt: iso(row.read_at) };
}

function rowToReviewTransferNotification(row: ReviewTransferNotificationRow): ReviewTransferNotification {
  return { id: row.id, targetType: "doc", docId: row.doc_id, docType: row.doc_type, docTitle: row.doc_title, actorName: row.actor_name, actorType: "human", kind: "review_transfer", createdAt: iso(row.created_at)!, readAt: iso(row.read_at) };
}

export async function getNotifications(userId: string): Promise<{ notifications: SiteNotification[]; unreadCount: number }> {
  const sql = getSql();
  const [replyRows, commentRows, transferRows, replyCountRows, commentCountRows, transferCountRows] = await Promise.all([
    sql`select n.id, n.post_id, p.title as post_title, n.reply_id, r.author_name as actor_name, r.author_type as actor_type, n.kind, n.created_at, n.read_at from reply_notifications n join posts p on p.id = n.post_id join post_replies r on r.id = n.reply_id where n.recipient_user_id = ${userId} order by n.created_at desc limit 50` as Promise<ReplyNotificationRow[]>,
    sql`select n.id, n.doc_id, d.doc_type, d.title as doc_title, n.comment_id, coalesce(b.name, u.username) as actor_name, c.author_type as actor_type, n.kind, n.created_at, n.read_at from doc_comment_notifications n join docs d on d.id = n.doc_id join doc_comments c on c.id = n.comment_id join users u on u.id = c.author_user_id left join bots b on b.id = c.author_bot_id where n.recipient_user_id = ${userId} order by n.created_at desc limit 50` as Promise<DocCommentNotificationRow[]>,
    sql`select n.id, n.doc_id, d.doc_type, d.title as doc_title, u.username as actor_name, n.created_at, n.read_at from doc_review_transfer_notifications n join docs d on d.id = n.doc_id join users u on u.id = d.review_transferred_by_user_id where n.recipient_user_id = ${userId} order by n.created_at desc limit 50` as Promise<ReviewTransferNotificationRow[]>,
    sql`select count(*)::int as count from reply_notifications where recipient_user_id = ${userId} and read_at is null` as Promise<Array<{ count: number }>>,
    sql`select count(*)::int as count from doc_comment_notifications where recipient_user_id = ${userId} and read_at is null` as Promise<Array<{ count: number }>>,
    sql`select count(*)::int as count from doc_review_transfer_notifications where recipient_user_id = ${userId} and read_at is null` as Promise<Array<{ count: number }>>,
  ]);
  const notifications = [...replyRows.map(rowToReplyNotification), ...commentRows.map(rowToDocCommentNotification), ...transferRows.map(rowToReviewTransferNotification)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 50);
  return { notifications, unreadCount: (replyCountRows[0]?.count ?? 0) + (commentCountRows[0]?.count ?? 0) + (transferCountRows[0]?.count ?? 0) };
}

// Backward-compatible name for callers that previously only displayed reply notifications.
export const getReplyNotifications = getNotifications;

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const sql = getSql();
  const now = new Date().toISOString();
  const [replyRows, commentRows, transferRows] = await Promise.all([
    sql`update reply_notifications set read_at = coalesce(read_at, ${now}) where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
    sql`update doc_comment_notifications set read_at = coalesce(read_at, ${now}) where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
    sql`update doc_review_transfer_notifications set read_at = coalesce(read_at, ${now}) where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
  ]);
  return replyRows.length + commentRows.length + transferRows.length > 0;
}

export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  const sql = getSql();
  const [replyRows, commentRows, transferRows] = await Promise.all([
    sql`delete from reply_notifications where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
    sql`delete from doc_comment_notifications where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
    sql`delete from doc_review_transfer_notifications where id = ${notificationId} and recipient_user_id = ${userId} returning id`,
  ]);
  return replyRows.length + commentRows.length + transferRows.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();
  await Promise.all([
    sql`update reply_notifications set read_at = ${now} where recipient_user_id = ${userId} and read_at is null`,
    sql`update doc_comment_notifications set read_at = ${now} where recipient_user_id = ${userId} and read_at is null`,
    sql`update doc_review_transfer_notifications set read_at = ${now} where recipient_user_id = ${userId} and read_at is null`,
  ]);
}

export const markReplyNotificationRead = markNotificationRead;
export const deleteReplyNotification = deleteNotification;
export const markAllReplyNotificationsRead = markAllNotificationsRead;
