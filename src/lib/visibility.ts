// 可见性唯一事实源（公开演示隔离模式）。规则：可见 ⇔ 作者/归属者 ∈ 演示账号 ∪ 当前用户。
// admin 无特权；未登录（viewerUserId=null）只见演示内容；互通模式（DEMO_ISOLATION=false）恒可见。
// 无 owner 的历史种子内容（authorUserId 与虾 owner 均空）在隔离模式下无人可见——
// 与删帖/审批的 owner 治理口径一致（无主内容无人可操作）。
import { getOptionalSql } from "./db.ts";
import type { Bot, MarkdownDoc, Post, PostReply } from "./types";

export type VisibilityContext = { isolated: boolean; publicUserIds: Set<string> };

export const DEFAULT_PUBLIC_ACCOUNTS = "用户1,用户2";

// DEMO_ISOLATION 默认 true；仅显式 false/0 关闭；非法值按隔离处理（fail-safe 方向为隔离）。
export function isolationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.DEMO_ISOLATION ?? "").trim().toLowerCase();
  return !(raw === "false" || raw === "0");
}

export function publicAccountNames(env: Record<string, string | undefined> = process.env): string[] {
  return (env.DEMO_PUBLIC_ACCOUNTS ?? DEFAULT_PUBLIC_ACCOUNTS)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

// 演示名单解析结果短缓存：同进程 10s 内复用，避免每次请求查库；
// 测试可显式重置（react cache 在路由/RSC 之外无请求边界，不用它）。
const CONTEXT_TTL_MS = 10_000;
let contextCache: { at: number; key: string; ctx: VisibilityContext } | null = null;

export function __resetVisibilityCacheForTests(): void {
  contextCache = null;
}

export async function getVisibilityContext(): Promise<VisibilityContext> {
  if (!isolationEnabled()) {
    return { isolated: false, publicUserIds: new Set<string>() };
  }
  const names = publicAccountNames();
  const key = names.join(",");
  if (contextCache && contextCache.key === key && Date.now() - contextCache.at < CONTEXT_TTL_MS) {
    return contextCache.ctx;
  }
  const sql = getOptionalSql();
  // 无 DB（JSON 回退路径）或名单为空：公共区为空集——隔离模式下各自只见自己的。
  const publicUserIds = new Set<string>();
  if (sql && names.length > 0) {
    const rows = (await sql`select id from users where username = any(${names})`) as Array<{ id: string }>;
    for (const row of rows) publicUserIds.add(row.id);
  }
  const ctx: VisibilityContext = { isolated: true, publicUserIds };
  contextCache = { at: Date.now(), key, ctx };
  return ctx;
}

// 归属判定核心：作者本人或归属虾的 owner，任一命中「演示名单 ∪ viewer」即可见。
function ownerVisible(
  authorUserId: string | null,
  botOwnerUserId: string | null,
  ctx: VisibilityContext,
  viewerUserId: string | null,
): boolean {
  for (const owner of [authorUserId, botOwnerUserId]) {
    if (owner === null) continue;
    if (owner === viewerUserId || ctx.publicUserIds.has(owner)) return true;
  }
  return false;
}

export function postVisibleTo(
  post: Post,
  botOwnerUserId: string | null,
  ctx: VisibilityContext,
  viewerUserId: string | null,
): boolean {
  if (!ctx.isolated) return true;
  return ownerVisible(post.authorUserId, botOwnerUserId, ctx, viewerUserId);
}

export function docVisibleTo(
  doc: MarkdownDoc,
  botsById: Map<string, Bot>,
  ctx: VisibilityContext,
  viewerUserId: string | null,
): boolean {
  if (!ctx.isolated) return true;
  if (doc.authorUserId && ownerVisible(doc.authorUserId, null, ctx, viewerUserId)) return true;
  for (const botId of doc.ownerBotIds) {
    const owner = botsById.get(botId)?.ownerUserId ?? null;
    if (owner && ownerVisible(null, owner, ctx, viewerUserId)) return true;
  }
  return false;
}

export function botVisibleTo(bot: Bot, ctx: VisibilityContext, viewerUserId: string | null): boolean {
  if (!ctx.isolated) return true;
  return ownerVisible(null, bot.ownerUserId, ctx, viewerUserId);
}

export function replyVisibleTo(
  reply: PostReply,
  botsById: Map<string, Bot>,
  ctx: VisibilityContext,
  viewerUserId: string | null,
): boolean {
  if (!ctx.isolated) return true;
  const botOwner = reply.authorBotId ? (botsById.get(reply.authorBotId)?.ownerUserId ?? null) : null;
  return ownerVisible(reply.authorUserId, botOwner, ctx, viewerUserId);
}

// 文档评论与 replyVisibleTo 同口径：人类评论看 authorUserId，虾评论看虾 owner。
export function commentVisibleTo(
  comment: { authorUserId: string | null; authorBotId: string | null },
  botsById: Map<string, Bot>,
  ctx: VisibilityContext,
  viewerUserId: string | null,
): boolean {
  if (!ctx.isolated) return true;
  const botOwner = comment.authorBotId ? (botsById.get(comment.authorBotId)?.ownerUserId ?? null) : null;
  return ownerVisible(comment.authorUserId, botOwner, ctx, viewerUserId);
}
