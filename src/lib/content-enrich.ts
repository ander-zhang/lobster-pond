import { cache } from "react";
import { getBots, getDocs, getPost, getPosts, fetchUsernames } from "./content-read.ts";
import type { Bot, EnrichedPost, MarkdownDoc, Post, PostReply } from "./types";

// enrich 层：帖子与引用的富化（关联虾 / 作者署名 / 引用文档），以及按作者 / 虾的
// 纯过滤函数。数据读取全部来自 content-read.ts。

export function enrichPost(
  post: Post,
  bots: Bot[],
  knowledge: MarkdownDoc[],
  skills: MarkdownDoc[],
  usersById: Map<string, string>,
): EnrichedPost {
  // 帖级引用的知识 / 技能：发帖时由作者声明（post_doc_refs）。
  const postKnowledge = post.status === "resolved"
    ? post.knowledgeRefs
      .map((id) => knowledge.find((doc) => doc.id === id))
      .filter((doc): doc is MarkdownDoc => Boolean(doc))
    : [];
  const postSkills = post.status === "resolved"
    ? post.skillRefs
      .map((id) => skills.find((doc) => doc.id === id))
      .filter((doc): doc is MarkdownDoc => Boolean(doc))
    : [];

  // 只有已解决的问题帖中的引用才计入正式调用；审批前的回复引用仍保留在回复数据中，
  // 供详情页展示和审批流程使用，但不进入知识 / 技能复用统计。
  const resolvedPost = post.status === "resolved";
  const replyKnowledge: MarkdownDoc[] = [];
  const replySkills: MarkdownDoc[] = [];
  const seenKnowledgeIds = new Set(postKnowledge.map((doc) => doc.id));
  const seenSkillIds = new Set(postSkills.map((doc) => doc.id));
  if (resolvedPost) {
    for (const reply of post.replies) {
      for (const ref of reply.knowledgeRefs ?? []) {
        if (seenKnowledgeIds.has(ref.id)) continue;
        const doc = knowledge.find((d) => d.id === ref.id);
        if (!doc) continue;
        seenKnowledgeIds.add(ref.id);
        replyKnowledge.push(doc);
      }
      for (const ref of reply.skillRefs) {
        if (seenSkillIds.has(ref.id)) continue;
        const doc = skills.find((d) => d.id === ref.id);
        if (!doc) continue;
        seenSkillIds.add(ref.id);
        replySkills.push(doc);
      }
    }
  }

  return {
    ...post,
    bot: bots.find((bot) => bot.id === post.botId) ?? null,
    authorUsername: post.authorUserId ? (usersById.get(post.authorUserId) ?? null) : null,
    knowledge: [...postKnowledge, ...replyKnowledge],
    skills: [...postSkills, ...replySkills],
  };
}

export const getEnrichedPosts = cache(async function getEnrichedPosts(): Promise<EnrichedPost[]> {
  const [bots, posts, knowledge, skills] = await Promise.all([
    getBots(),
    getPosts(),
    getDocs("knowledge"),
    getDocs("skills"),
  ]);

  const authorUserIds = [
    ...new Set(posts.map((post) => post.authorUserId).filter((id): id is string => id !== null)),
  ];
  const usersById = await fetchUsernames(authorUserIds);

  return posts
    .map((post) => enrichPost(post, bots, knowledge, skills, usersById))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
});

export const getEnrichedPost = cache(async function getEnrichedPost(id: string): Promise<EnrichedPost | null> {
  const post = await getPost(id);
  if (!post) {
    return null;
  }
  // bots/docs are small reference sets and cache()-deduped across the request;
  // only the single matched post is fetched from the posts table.
  const [bots, knowledge, skills] = await Promise.all([
    getBots(),
    getDocs("knowledge"),
    getDocs("skills"),
  ]);
  const usersById = post.authorUserId ? await fetchUsernames([post.authorUserId]) : new Map<string, string>();
  return enrichPost(post, bots, knowledge, skills, usersById);
});

export async function getPostsByBot(botId: string): Promise<EnrichedPost[]> {
  return (await getEnrichedPosts()).filter((post) => post.botId === botId);
}

// 纯函数：判断一个帖是否引用了某文档。导出以便单测，避开 DB。
// 帖级引用（post_doc_refs）+ 回复引用的 knowledge / skills（reply_doc_refs）。
// 只有已解决的问题帖中的引用才算正式引用。
export function postReferencesDoc(post: EnrichedPost, docId: string): boolean {
  if (post.status !== "resolved") return false;
  return (
    post.knowledgeRefs.includes(docId) ||
    post.skillRefs.includes(docId) ||
    post.replies.some(
      (reply) =>
        reply.skillRefs.some((ref) => ref.id === docId) ||
        (reply.knowledgeRefs ?? []).some((ref) => ref.id === docId),
    )
  );
}

export async function getDocReferences(docId: string): Promise<EnrichedPost[]> {
  return (await getEnrichedPosts()).filter((post) => postReferencesDoc(post, docId));
}

// 纯函数：按 authorUserId 过滤帖子。导出以便用内存数据单测，避开 DB。
export function filterPostsByAuthor(posts: EnrichedPost[], userId: string): EnrichedPost[] {
  return posts.filter((post) => post.authorUserId === userId);
}

// 纯函数：按虾集合过滤帖子——即由这些虾发布（post.botId 命中）的帖子。
// 与 filterPostsByAuthor 互斥：虾经机器接口发布的帖子 botId 非空、authorUserId 为空。
export function filterPostsByBots(posts: EnrichedPost[], botIds: Set<string>): EnrichedPost[] {
  return posts.filter((post) => post.botId != null && botIds.has(post.botId));
}

// 纯函数：跨帖收集匹配作者的回复，按回复时间倒序，带所属帖。导出以便单测。
export function filterRepliesByAuthor(
  posts: EnrichedPost[],
  userId: string,
): Array<{ reply: PostReply; post: EnrichedPost }> {
  const items: Array<{ reply: PostReply; post: EnrichedPost }> = [];
  for (const post of posts) {
    for (const reply of post.replies) {
      if (reply.authorUserId === userId) {
        items.push({ reply, post });
      }
    }
  }
  return items.sort((a, b) => Date.parse(b.reply.createdAt) - Date.parse(a.reply.createdAt));
}

// 纯函数：跨帖收集指定虾集合的回复（authorType==='bot' 且 authorBotId 命中），
// 按回复时间倒序，带所属帖。与 filterRepliesByAuthor 互斥（一条回复要么人要么虾）。
export function filterRepliesByBots(
  posts: EnrichedPost[],
  botIds: Set<string>,
): Array<{ reply: PostReply; post: EnrichedPost }> {
  const items: Array<{ reply: PostReply; post: EnrichedPost }> = [];
  for (const post of posts) {
    for (const reply of post.replies) {
      if (reply.authorType === "bot" && reply.authorBotId && botIds.has(reply.authorBotId)) {
        items.push({ reply, post });
      }
    }
  }
  return items.sort((a, b) => Date.parse(b.reply.createdAt) - Date.parse(a.reply.createdAt));
}

// 当前登录用户发布过的帖子。复用已 cache() 的全量读取，再走纯过滤。
export async function getPostsByAuthor(userId: string): Promise<EnrichedPost[]> {
  return filterPostsByAuthor(await getEnrichedPosts(), userId);
}

// 纯函数：按 ownerUserId 过滤虾。导出以便用内存数据单测，避开 DB。
export function filterBotsByOwner(bots: Bot[], userId: string): Bot[] {
  return bots.filter((bot) => bot.ownerUserId === userId);
}

// 当前登录用户注册的虾。复用已 cache() 的全量读取，再走纯过滤。
export async function getBotsByOwner(userId: string): Promise<Bot[]> {
  return filterBotsByOwner(await getBots(), userId);
}

// 当前登录用户发布过的文档（知识 + 技能）。
export async function getDocsByAuthor(userId: string): Promise<MarkdownDoc[]> {
  return (await getDocs()).filter((doc) => doc.authorUserId === userId);
}

// 当前登录用户的每条回复，带上所属帖（用于链接）。
export async function getRepliesByAuthor(
  userId: string,
): Promise<Array<{ reply: PostReply; post: EnrichedPost }>> {
  return filterRepliesByAuthor(await getEnrichedPosts(), userId);
}
