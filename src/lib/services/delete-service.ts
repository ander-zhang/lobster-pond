import { getBots, getDoc, getDocs, getPosts } from "../content.ts";
import type { Bot, DocType } from "../types.ts";
import { deleteBotRow, deleteDocRow, deletePostRow } from "../content-mutations.ts";
import { getSql } from "../db.ts";
import { type SessionUser } from "./session.ts";
import { canDeleteBot, type ServiceResult } from "./bot-service.ts";
import { canDeleteDoc } from "./doc-service.ts";
import { canDeletePost } from "./post-service.ts";

// 破坏性删除统一要求管理员：未登录 401，非管理员 403。授权在服务层把关，
// 路由层只负责把 status 透传成 HTTP 状态码。
export type DeleteResult<T> = ServiceResult<T> | { ok: false; status: number; error: string };

// Deletes a problem post outright (its doc references go with it). Leaf node,
// nothing depends on a post, so no dependency checks. Author only: the post's
// authorUserId must match the current user (admins have no override, matching
// delete-reply / delete-bot). Posts without authorUserId (bot/seed) cannot be
// deleted by anyone.
export async function deletePost(id: string, currentUser: SessionUser | null): Promise<DeleteResult<{ id: string }>> {
  const sql = getSql();
  const rows = (await sql`select author_user_id from posts where id = ${id}`) as Array<{ author_user_id: string | null }>;
  const row = rows[0];
  if (!row) {
    return { ok: false, error: `post not found: ${id}` };
  }

  const decision = canDeletePost(currentUser, row.author_user_id ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const deleted = await deletePostRow(id);
  if (!deleted) {
    return { ok: false, error: `post not found: ${id}` };
  }
  return { ok: true, data: { id } };
}

// Deletes a knowledge/skill doc. Citing posts lose this reference via the
// ON DELETE CASCADE on post_doc_refs — cascade is the chosen policy. Author
// only: the doc's authorUserId must match the current user (admins have no
// override, matching delete-post / delete-bot). Docs without authorUserId
// (historical / seed) cannot be deleted by anyone.
export async function deleteDoc(id: string, currentUser: SessionUser | null): Promise<DeleteResult<{ id: string; citingPosts: string[] }>> {
  const sql = getSql();
  const rows = (await sql`select author_user_id from docs where id = ${id}`) as Array<{ author_user_id: string | null }>;
  const row = rows[0];
  if (!row) {
    return { ok: false, error: `doc not found: ${id}` };
  }

  const decision = canDeleteDoc(currentUser, row.author_user_id ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const citing = (await sql`select post_id from post_doc_refs where doc_id = ${id}`) as Array<{ post_id: string }>;
  const deleted = await deleteDocRow(id);
  if (!deleted) {
    return { ok: false, error: `doc not found: ${id}` };
  }
  return { ok: true, data: { id, citingPosts: citing.map((r) => r.post_id) } };
}

// Deletes a bot only when nothing depends on it. Posts authored by the bot
// block deletion; the caller must remove those first. Owner only; seed bots (null owner) cannot be deleted.
export async function deleteBot(id: string, currentUser: SessionUser | null): Promise<DeleteResult<{ id: string }>> {
  const bots = await getBots();
  const bot = bots.find((item) => item.id === id);
  if (!bot) {
    return { ok: false, error: `bot not found: ${id}` };
  }

  // 虾删除仅 owner 本人；管理员无越权；种子虾（ownerUserId=null）无人可删。
  const decision = canDeleteBot(currentUser, bot.ownerUserId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const posts = await getPosts();
  const ownedPosts = posts.filter((post) => post.botId === id).map((post) => post.id);

  // Also block if this bot owns any docs, since ownerBotIds would dangle.
  const docs = await getDocs();
  const ownedDocs = docs.filter((doc) => doc.ownerBotIds.includes(id)).map((doc) => doc.id);

  const sql = getSql();
  const commentRows = (await sql`
    select id from doc_comments where author_type = 'bot' and author_bot_id = ${id} order by created_at asc
  `) as Array<{ id: string }>;

  if (ownedPosts.length > 0 || ownedDocs.length > 0 || commentRows.length > 0) {
    const parts: string[] = [];
    if (ownedPosts.length > 0) {
      parts.push(`问题帖 ${ownedPosts.length} 条（${ownedPosts.slice(0, 5).join(", ")}${ownedPosts.length > 5 ? " …" : ""}）`);
    }
    if (ownedDocs.length > 0) {
      parts.push(`知识/技能 ${ownedDocs.length} 条（${ownedDocs.slice(0, 5).join(", ")}${ownedDocs.length > 5 ? " …" : ""}）`);
    }
    if (commentRows.length > 0) {
      parts.push(`文档评论 ${commentRows.length} 条（${commentRows.slice(0, 5).map((comment) => comment.id).join(", ")}${commentRows.length > 5 ? " …" : ""}）`);
    }
    return {
      ok: false,
      error: `无法删除机器人 ${id}：仍有依赖，请先处理 ${parts.join("；")}`,
    };
  }

  const deleted = await deleteBotRow(id);
  if (!deleted) {
    return { ok: false, error: `bot not found: ${id}` };
  }
  return { ok: true, data: { id } };
}

// 虾删除问题帖授权（纯函数）。帖子归属虾 == 当前 token 虾才放行。
// 未鉴权（401）由路由层 authenticateBotRequest 拦截，此处只判归属。
export function canDeleteBotPost(
  bot: Bot,
  postBotId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (postBotId !== null && postBotId === bot.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除该虾发布的问题帖" };
}

// 虾删除自己发布的问题帖。引用帖经 post_doc_refs ON DELETE CASCADE 级联失去引用。
export async function deleteBotPost(id: string, bot: Bot): Promise<DeleteResult<{ id: string }>> {
  const sql = getSql();
  const rows = (await sql`select bot_id from posts where id = ${id}`) as Array<{ bot_id: string | null }>;
  const row = rows[0];
  if (!row) {
    return { ok: false, error: `post not found: ${id}` };
  }
  const decision = canDeleteBotPost(bot, row.bot_id ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  const deleted = await deletePostRow(id);
  if (!deleted) {
    return { ok: false, error: `post not found: ${id}` };
  }
  return { ok: true, data: { id } };
}

// 虾删除文档授权（纯函数）。文档归属虾 ∈ ownerBotIds 才放行。
export function canDeleteBotDoc(
  bot: Bot,
  docOwnerBotIds: string[],
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (docOwnerBotIds.includes(bot.id)) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除该虾发布的文档" };
}

// 虾删除自己发布的文档。引用帖经 post_doc_refs ON DELETE CASCADE 级联失去引用，
// 返回 citingPosts（与网页 deleteDoc 语义一致，不阻塞）。
export async function deleteBotDoc(type: DocType, id: string, bot: Bot): Promise<DeleteResult<{ id: string; citingPosts: string[] }>> {
  const doc = await getDoc(type, id);
  if (!doc) {
    return { ok: false, error: `doc not found: ${id}` };
  }
  const decision = canDeleteBotDoc(bot, doc.ownerBotIds);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  const sql = getSql();
  const citing = (await sql`select post_id from post_doc_refs where doc_id = ${id}`) as Array<{ post_id: string }>;
  const deleted = await deleteDocRow(id);
  if (!deleted) {
    return { ok: false, error: `doc not found: ${id}` };
  }
  return { ok: true, data: { id, citingPosts: citing.map((r) => r.post_id) } };
}
