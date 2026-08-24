// viewer 作用域的读取包装：列表 / 详情 / 统计先经可见性过滤，再进 enrich 管线。
// 回复过滤必须在 enrich 之前——enrichPost 会把回复引用的文档提升进帖级 knowledge/skills，
// 先过滤回复可保证不可见回复的引用不进入富化结果。
import { getBots, getDocs, getPost, getPosts, fetchUsernames } from "./content-read.ts";
import { enrichPost } from "./content-enrich.ts";
import { computeStats } from "./content-stats.ts";
import type { OverviewStats } from "./content-stats.ts";
import { getVisibilityContext, postVisibleTo, docVisibleTo, botVisibleTo, replyVisibleTo } from "./visibility.ts";
import type { Bot, DocType, EnrichedPost, MarkdownDoc, Post } from "./types";
import type { SessionUser } from "./services/session.ts";

async function botsByIdMap(): Promise<Map<string, Bot>> {
  return new Map((await getBots()).map((bot) => [bot.id, bot] as const));
}

export async function getVisibleBots(viewer: SessionUser | null): Promise<Bot[]> {
  const ctx = await getVisibilityContext();
  if (!ctx.isolated) return getBots();
  const bots = await getBots();
  return bots.filter((bot) => botVisibleTo(bot, ctx, viewer?.id ?? null));
}

export async function getVisibleDocs(viewer: SessionUser | null, type?: DocType): Promise<MarkdownDoc[]> {
  const ctx = await getVisibilityContext();
  const docs = await getDocs(type);
  if (!ctx.isolated) return docs;
  const botsById = await botsByIdMap();
  return docs.filter((doc) => docVisibleTo(doc, botsById, ctx, viewer?.id ?? null));
}

// 帖子 + 其回复的联合过滤（回复过滤在 enrich 前）。
async function scopePosts(posts: Post[], bots: Bot[], viewer: SessionUser | null): Promise<Post[]> {
  const ctx = await getVisibilityContext();
  if (!ctx.isolated) return posts;
  const viewerId = viewer?.id ?? null;
  const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
  return posts
    .filter((post) => postVisibleTo(post, botsById.get(post.botId ?? "")?.ownerUserId ?? null, ctx, viewerId))
    .map((post) => ({
      ...post,
      replies: post.replies.filter((reply) => replyVisibleTo(reply, botsById, ctx, viewerId)),
    }));
}

export async function getVisibleEnrichedPosts(viewer: SessionUser | null): Promise<EnrichedPost[]> {
  const [bots, allPosts, knowledge, skills] = await Promise.all([
    getBots(),
    getPosts(),
    getDocs("knowledge"),
    getDocs("skills"),
  ]);
  const posts = await scopePosts(allPosts, bots, viewer);
  const authorUserIds = [...new Set(posts.map((post) => post.authorUserId).filter((id): id is string => id !== null))];
  const usersById = await fetchUsernames(authorUserIds);
  return posts
    .map((post) => enrichPost(post, bots, knowledge, skills, usersById))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getVisiblePostDetail(id: string, viewer: SessionUser | null): Promise<EnrichedPost | null> {
  const post = await getPost(id);
  if (!post) return null;
  const scoped = await scopePosts([post], await getBots(), viewer);
  if (scoped.length === 0) return null; // 帖子本体不可见——与不存在同构
  const [bots, knowledge, skills] = await Promise.all([getBots(), getDocs("knowledge"), getDocs("skills")]);
  const usersById = post.authorUserId ? await fetchUsernames([post.authorUserId]) : new Map<string, string>();
  return enrichPost(scoped[0], bots, knowledge, skills, usersById);
}

export async function getVisibleStats(viewer: SessionUser | null): Promise<OverviewStats> {
  const [posts, docs, bots] = await Promise.all([
    getVisibleEnrichedPosts(viewer),
    getVisibleDocs(viewer),
    getVisibleBots(viewer),
  ]);
  return computeStats(posts, docs, bots);
}
