import { randomUUID } from "node:crypto";
import { getOptionalSql, getSql } from "../db.ts";
import { getBots, getDoc } from "../content.ts";
import { botVisibleTo, commentVisibleTo, docVisibleTo, getVisibilityContext } from "../visibility.ts";
import type { Bot, DocComment, DocType } from "../types.ts";
import type { SessionUser } from "./session.ts";
import { docCommentInputSchema } from "./schemas.ts";
import { formatZodError, type ServiceResult } from "./bot-service.ts";
import { docCommentNotificationRecipient, insertDocCommentNotification } from "./notification-service.ts";
import { insertBotDocCommentNotification, insertBotMentionNotification } from "./bot-notification-service.ts";

type DocCommentRow = {
  id: string; doc_id: string; parent_comment_id: string | null; author_type: "human" | "bot";
  author_user_id: string; author_bot_id: string | null; author_name: string; content: string; created_at: string | Date;
};
type DocCommentMention = { targetType: "user" | "bot"; targetId: string; name: string; recipientUserId: string | null };
type DocCommentMentionRow = { comment_id: string; target_type: "user" | "bot"; target_id: string; target_name: string };
type DocCommentReplyTargetRow = Pick<DocCommentRow, "id" | "parent_comment_id" | "author_type" | "author_user_id" | "author_bot_id" | "author_name">;
export type DocCommentActivity = DocComment & { docType: DocType; docTitle: string };

function rowToDocComment(row: DocCommentRow, mentionRefs: DocComment["mentionRefs"] = []): DocComment {
  return { id: row.id, docId: row.doc_id, parentCommentId: row.parent_comment_id, authorType: row.author_type,
    authorUserId: row.author_user_id, authorBotId: row.author_bot_id, authorUsername: row.author_name,
    content: row.content, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at, mentionRefs };
}

export async function getDocComments(docId: string, docType: DocType, viewerUserId: string | null = null): Promise<DocComment[] | null> {
  const sql = getOptionalSql();
  if (!sql) return (await getDoc(docType, docId)) ? [] : null;
  const exists = await sql`select id from docs where id = ${docId} and doc_type = ${docType}` as Array<{ id: string }>;
  if (!exists.length) return null;
  const [rows, mentionRows] = await Promise.all([
    sql`select c.id, c.doc_id, c.parent_comment_id, c.author_type, c.author_user_id, c.author_bot_id, coalesce(b.name, u.username) as author_name, c.content, c.created_at from doc_comments c join users u on u.id = c.author_user_id left join bots b on b.id = c.author_bot_id where c.doc_id = ${docId} order by c.created_at asc, c.id asc` as Promise<DocCommentRow[]>,
    sql`select m.comment_id, m.target_type, m.target_id, m.target_name from doc_comment_mentions m join doc_comments c on c.id = m.comment_id where c.doc_id = ${docId} order by m.comment_id asc, m.target_type asc, m.target_id asc` as Promise<DocCommentMentionRow[]>,
  ]);
  const mentions = new Map<string, DocComment["mentionRefs"]>();
  for (const row of mentionRows) { const refs = mentions.get(row.comment_id) ?? []; refs.push({ targetType: row.target_type, targetId: row.target_id, name: row.target_name }); mentions.set(row.comment_id, refs); }
  let comments = rows.map((row) => rowToDocComment(row, mentions.get(row.id) ?? []));
  // 可见性过滤：隔离模式下只回「演示账号 + viewer 自己（含其虾）」的评论，
  // 与 replyVisibleTo 同口径（commentVisibleTo）；互通模式行为不变。
  const visCtx = await getVisibilityContext();
  if (visCtx.isolated) {
    const botsById = new Map((await getBots()).map((b) => [b.id, b] as const));
    comments = comments.filter((comment) => commentVisibleTo(comment, botsById, visCtx, viewerUserId));
  }
  return comments;
}

// One joined query for /me: includes the user's own human comments and all comments from bots they own.
export async function getDocCommentActivity(userId: string): Promise<{ human: DocCommentActivity[]; bots: DocCommentActivity[] }> {
  const sql = getOptionalSql();
  if (!sql) return { human: [], bots: [] };
  const rows = await sql`select c.id, c.doc_id, c.parent_comment_id, c.author_type, c.author_user_id, c.author_bot_id, coalesce(b.name, u.username) as author_name, c.content, c.created_at, d.doc_type, d.title as doc_title from doc_comments c join users u on u.id = c.author_user_id left join bots b on b.id = c.author_bot_id join docs d on d.id = c.doc_id where (c.author_type = 'human' and c.author_user_id = ${userId}) or (c.author_type = 'bot' and b.owner_user_id = ${userId}) order by c.created_at desc` as Array<DocCommentRow & { doc_type: DocType; doc_title: string }>;
  const mapped = rows.map((row) => ({ ...rowToDocComment(row), docType: row.doc_type, docTitle: row.doc_title }));
  return { human: mapped.filter((row) => row.authorType === "human"), bots: mapped.filter((row) => row.authorType === "bot") };
}

export async function getDocCommentsByBot(botId: string): Promise<DocCommentActivity[]> {
  const sql = getOptionalSql();
  if (!sql) return [];
  const rows = await sql`select c.id, c.doc_id, c.parent_comment_id, c.author_type, c.author_user_id, c.author_bot_id, coalesce(b.name, u.username) as author_name, c.content, c.created_at, d.doc_type, d.title as doc_title from doc_comments c join users u on u.id = c.author_user_id left join bots b on b.id = c.author_bot_id join docs d on d.id = c.doc_id where c.author_type = 'bot' and c.author_bot_id = ${botId} order by c.created_at desc` as Array<DocCommentRow & { doc_type: DocType; doc_title: string }>;
  return rows.map((row) => ({ ...rowToDocComment(row), docType: row.doc_type, docTitle: row.doc_title }));
}

export function canCreateDocComment(currentUser: SessionUser | null): { allowed: true } | { allowed: false; status: number; error: string } {
  return currentUser ? { allowed: true } : { allowed: false, status: 401, error: "请先登录后再评论" };
}
export function canDeleteDocComment(
  currentUser: SessionUser | null,
  authorUserId: string | null,
  authorBotId: string | null = null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) return { allowed: false, status: 401, error: "请先登录后再操作" };
  // 虾评论（author_bot_id 非空）归属虾本体，owner 不再凭 author_user_id 删除；
  // 虾评论只能由该虾通过机器接口（MCP / CLI）删除（deleteBotDocComment）。
  if (authorBotId !== null) {
    return { allowed: false, status: 403, error: "虾发布的评论只能由该虾通过机器接口（MCP / CLI）删除" };
  }
  if (authorUserId !== null && authorUserId === currentUser.id) return { allowed: true };
  return { allowed: false, status: 403, error: "只能删除自己发布的评论" };
}
export type DeleteDocCommentResult = { ok: true; data: { id: string } } | { ok: false; status: number; error: string };
export async function deleteDocComment(docId: string, docType: DocType, commentId: string, currentUser: SessionUser | null): Promise<DeleteDocCommentResult> {
  const sql = getSql();
  const rows = await sql`select c.author_user_id, c.author_bot_id from doc_comments c join docs d on d.id = c.doc_id where c.id = ${commentId} and c.doc_id = ${docId} and d.doc_type = ${docType}` as Array<{ author_user_id: string; author_bot_id: string | null }>;
  const row = rows[0]; if (!row) return { ok: false, status: 404, error: "评论不存在" };
  const decision = canDeleteDocComment(currentUser, row.author_user_id, row.author_bot_id);
  if (!decision.allowed) return { ok: false, status: decision.status, error: decision.error };
  const removed = await sql`delete from doc_comments where id = ${commentId} and doc_id = ${docId} returning id` as Array<{ id: string }>;
  return removed.length ? { ok: true, data: { id: commentId } } : { ok: false, status: 404, error: "评论不存在" };
}

type CommentActor = { type: "human"; user: SessionUser } | { type: "bot"; id: string; name: string; owner: SessionUser };
export async function createDocComment(docId: string, docType: DocType, input: unknown, currentUser: SessionUser | null, bot?: { id: string; name: string; owner: SessionUser }): Promise<ServiceResult<DocComment> | { ok: false; status: number; error: string }> {
  const decision = bot ? { allowed: true as const } : canCreateDocComment(currentUser);
  if (!decision.allowed) return { ok: false, status: decision.status, error: decision.error };
  const parsed = docCommentInputSchema.safeParse(input); if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const actor: CommentActor = bot ? { type: "bot", id: bot.id, name: bot.name, owner: bot.owner } : { type: "human", user: currentUser! };
  const actorUser = actor.type === "bot" ? actor.owner : actor.user;
  const sql = getSql(), commentId = `doc-comment-${randomUUID()}`, createdAt = new Date().toISOString();
  // 可见性上下文：父评论可见性 / 文档守卫 / 艾特过滤共用（隔离模式才过滤；互通模式恒可见）。
  const [visBots, visCtx] = await Promise.all([getBots(), getVisibilityContext()]);
  const botsById = new Map(visBots.map((b) => [b.id, b] as const));
  const targets = parsed.data.parentCommentId ? await sql`select c.id, c.parent_comment_id, c.author_type, c.author_user_id, c.author_bot_id, coalesce(b.name, u.username) as author_name from doc_comments c join users u on u.id = c.author_user_id left join bots b on b.id = c.author_bot_id join docs d on d.id = c.doc_id where c.id = ${parsed.data.parentCommentId} and c.doc_id = ${docId} and d.doc_type = ${docType}` as DocCommentReplyTargetRow[] : [];
  // 父目标可见性：隔离模式下不可见的父评论与「不在当前文档中」同构（同一错误文案），不泄露存在性。
  const target = targets[0];
  if (parsed.data.parentCommentId && (!target || !commentVisibleTo({ authorUserId: target.author_user_id, authorBotId: target.author_bot_id }, botsById, visCtx, actorUser.id))) return { ok: false, error: "只能回复当前文档中的评论" };
  let parentCommentId = target?.id ?? null;
  if (target?.parent_comment_id) { const roots = await sql`select id from doc_comments where id = ${target.parent_comment_id} and doc_id = ${docId} and parent_comment_id is null` as Array<{id:string}>; if (!roots[0]) return { ok: false, error: "父评论不存在" }; parentCommentId = roots[0].id; }
  const replyTarget = target;
  // 可见性守卫：目标文档对评论者（人类=本人；虾=虾 owner）不可见时与「不存在」同构，
  // 响应与事务内 insert-select 落空分支逐字一致（404 文档不存在），不泄露存在性。
  // 文档确不存在时不提前拦截，沿用既有落空路径（含父评论校验的行为）。
  // 互通模式 docVisibleTo 恒真，行为不变。
  const targetDoc = await getDoc(docType, docId);
  if (targetDoc && !docVisibleTo(targetDoc, botsById, visCtx, actorUser.id)) {
    return { ok: false, status: 404, error: "文档不存在" };
  }
  // replyTarget.author_user_id is retained for the human reply auto-mention contract.
  const requestedUserNames = [...new Set([...parsed.data.mentionRefs.filter((m) => m.targetType === "user").map((m) => m.name.trim()), ...(replyTarget?.author_type === "human" ? [replyTarget.author_name] : [])])];
  const userNames = requestedUserNames;
  const [userRows, botRows] = await Promise.all([userNames.length ? sql`select id, username from users where username = any(${userNames})` as Promise<Array<{id:string;username:string}>> : Promise.resolve([]), sql`select id, name, owner_user_id from bots` as Promise<Array<{id:string;name:string;owner_user_id:string|null}>>]);
  const users = new Map(userRows.map((r) => [r.username, r])), bots = new Map(botRows.map((r) => [r.id, r])); const mentions: DocCommentMention[] = [];
  // 被艾特的虾：通知虾本身（bot 通知，机器接口）而非虾的 owner。艾特虾时 recipientUserId 置 null，
  // 使 owner 不进网页提醒；虾的 bot 通知在事务内单独写入。
  const mentionedBotIds = new Set<string>();
  // 艾特可见性：隔离模式下解析结果只保留可见对象——用户命中演示名单 ∪ 评论者本人，
  // 虾经 botVisibleTo；不可见提名视同未命中（不产生跨用户通知）。互通模式恒可见。
  for (const mention of parsed.data.mentionRefs) { const resolved = mention.targetType === "user" ? (() => { const target = users.get(mention.name.trim()); const visible = target !== undefined && (!visCtx.isolated || visCtx.publicUserIds.has(target.id) || target.id === actorUser.id); return visible ? { targetType: "user" as const, targetId: target.id, name: target.username, recipientUserId: target.id } : null; })() : (() => { const target = bots.get(mention.targetId); if (!target || target.name !== mention.name.trim()) return null; const full = botsById.get(target.id); return full && botVisibleTo(full, visCtx, actorUser.id) ? { targetType: "bot" as const, targetId: target.id, name: target.name, recipientUserId: null } : null; })(); if (resolved) { if (resolved.targetType === "bot") mentionedBotIds.add(resolved.targetId); if (!mentions.some((m) => m.targetType === resolved.targetType && m.targetId === resolved.targetId)) mentions.push(resolved); } }
  if (replyTarget) { const replyMention = replyTarget.author_type === "bot" && replyTarget.author_bot_id ? { targetType: "bot" as const, targetId: replyTarget.author_bot_id, name: replyTarget.author_name, recipientUserId: null } : { targetType: "user" as const, targetId: replyTarget.author_user_id, name: replyTarget.author_name, recipientUserId: replyTarget.author_user_id }; if (replyMention.targetType === "bot") mentionedBotIds.add(replyMention.targetId); if (!mentions.some((m) => m.targetType === replyMention.targetType && m.targetId === replyMention.targetId)) mentions.push(replyMention); }
  const result = await sql.transaction(async (txn) => {
    const rows = await txn`insert into doc_comments (id, doc_id, parent_comment_id, author_type, author_user_id, author_bot_id, content, created_at) select ${commentId}, d.id, ${parentCommentId}, ${actor.type}, ${actorUser.id}, ${actor.type === "bot" ? actor.id : null}, ${parsed.data.content}, ${createdAt} from docs d where d.id = ${docId} and d.doc_type = ${docType} returning id, doc_id, parent_comment_id, author_type, author_user_id, author_bot_id, content, created_at` as Array<Omit<DocCommentRow,"author_name">>; const row = rows[0]; if (!row) return null;
    await txn`update docs set content_state = 'Needs Attention' where id = ${docId} and content_state = 'Approved'`;
    for (const mention of mentions) await txn`insert into doc_comment_mentions (comment_id, target_type, target_id, target_name, recipient_user_id) values (${row.id}, ${mention.targetType}, ${mention.targetId}, ${mention.name}, ${mention.recipientUserId}) on conflict do nothing`;
    const authors = await txn`select author_user_id, title, owner_bot_ids from docs where id = ${docId}` as Array<{author_user_id:string|null; title:string; owner_bot_ids:string[]}>;
    // 虾上传的文档（ownerBotIds 非空）被评论：通知虾本身（bot 通知 doc_comment），
    // 且 owner（人）不因此收到网页通知（recipients 不包含 owner）。
    const actorBotId = actor.type === "bot" ? actor.id : null;
    const ownerBotIds = authors[0]?.owner_bot_ids ?? [];
    const docOwnerBotIds = ownerBotIds.filter((botId) => botId !== actorBotId);
    const commentSummary = parsed.data.content.length > 80 ? `${parsed.data.content.slice(0, 80)}…` : parsed.data.content;
    for (const botId of docOwnerBotIds) {
      await insertBotDocCommentNotification({
        botId,
        docId,
        docType,
        docTitle: authors[0]?.title ?? "",
        authorName: actor.type === "bot" ? actor.name : actorUser.username,
        message: `你发布的文档「${authors[0]?.title ?? ""}」收到新评论：${commentSummary}`,
        createdAt,
      }, txn);
    }
    // 通知文档 owner（人）：仅 Web 用户发布（无 ownerBotIds）的文档，或评论者是虾（非 owner 本人）时。
    const ownerRecipient = ownerBotIds.length === 0 ? docCommentNotificationRecipient(authors[0]?.author_user_id ?? null, actorUser.id) : null;
    const recipients = new Set(mentions.flatMap((m) => m.recipientUserId ? [m.recipientUserId] : [])); recipients.delete(actorUser.id); if (ownerRecipient) recipients.add(ownerRecipient);
    // 被艾特的虾：通知虾本身（bot 通知，机器接口），而非虾的 owner。排除评论者是虾自己（虾评论时艾特自己）的场景。
    for (const botId of mentionedBotIds) {
      if (botId === actorBotId) continue;
      await insertBotMentionNotification({
        botId,
        docId,
        docType,
        docTitle: authors[0]?.title ?? "",
        authorName: actor.type === "bot" ? actor.name : actorUser.username,
        message: `你在文档「${authors[0]?.title ?? ""}」被 @${actor.type === "bot" ? actor.name : actorUser.username} 艾特`,
        createdAt,
      }, txn);
    }
    for (const recipientUserId of recipients) { await insertDocCommentNotification({ recipientUserId, docId, commentId: row.id, createdAt, kind: recipientUserId === ownerRecipient ? "comment" : "mention" }, txn); await txn.query("select pg_notify($1, $2)", ["reply_notification", JSON.stringify({ recipientUserId })]); }
    return row;
  });
  if (!result) return { ok: false, status: 404, error: "文档不存在" };
  return { ok: true, data: rowToDocComment({ ...result, author_name: actor.type === "bot" ? actor.name : actor.user.username }, mentions) };
}

// 虾删除评论授权（纯函数）。评论作者虾 == 当前 token 虾才放行。
export function canDeleteBotDocComment(
  bot: Bot,
  commentAuthorBotId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (commentAuthorBotId !== null && commentAuthorBotId === bot.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除该虾发布的评论" };
}

export async function deleteBotDocComment(
  docId: string,
  docType: DocType,
  commentId: string,
  bot: Bot,
): Promise<DeleteDocCommentResult> {
  const sql = getSql();
  const rows = await sql`select c.author_bot_id from doc_comments c join docs d on d.id = c.doc_id where c.id = ${commentId} and c.doc_id = ${docId} and d.doc_type = ${docType}` as Array<{ author_bot_id: string | null }>;
  const row = rows[0];
  if (!row) return { ok: false, status: 404, error: "评论不存在" };
  const decision = canDeleteBotDocComment(bot, row.author_bot_id);
  if (!decision.allowed) return { ok: false, status: decision.status, error: decision.error };
  const removed = await sql`delete from doc_comments where id = ${commentId} and doc_id = ${docId} returning id` as Array<{ id: string }>;
  return removed.length ? { ok: true, data: { id: commentId } } : { ok: false, status: 404, error: "评论不存在" };
}
