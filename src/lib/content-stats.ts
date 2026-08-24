import { getBots, getDocs, getPosts } from "./content-read.ts";
import { contentStateFormalUse } from "./format.ts";
import type { Bot, MarkdownDoc, Post } from "./types";

// 统计层：总览页 hero 数字与引用健康检查。数据读取来自 content-read.ts。

export type OverviewStats = {
  posts: number;
  bots: number;
  knowledge: number;
  skills: number;
  resolved: number;
};

// 总览页 hero 统计的纯函数：知识/技能只计已批准（Approved），与 /library 口径一致；
// 帖子含全状态、虾全量，不过滤。纯函数避开 DB，便于单测。
export function computeStats(posts: Post[], docs: MarkdownDoc[], bots: Bot[]): OverviewStats {
  const formalDocs = docs.filter((doc) => contentStateFormalUse(doc.contentState) === "yes");
  return {
    posts: posts.length,
    bots: bots.length,
    knowledge: formalDocs.filter((doc) => doc.type === "knowledge").length,
    skills: formalDocs.filter((doc) => doc.type === "skills").length,
    resolved: posts.filter((post) => post.status === "resolved").length,
  };
}

export async function getStats(): Promise<OverviewStats> {
  const [posts, docs, bots] = await Promise.all([getPosts(), getDocs(), getBots()]);
  return computeStats(posts, docs, bots);
}

export async function getReferenceHealth() {
  const [bots, docs, posts] = await Promise.all([getBots(), getDocs(), getPosts()]);
  const botIds = new Set(bots.map((bot) => bot.id));
  const knowledgeIds = new Set(docs.filter((doc) => doc.type === "knowledge").map((doc) => doc.id));
  const skillIds = new Set(docs.filter((doc) => doc.type === "skills").map((doc) => doc.id));
  const missing: string[] = [];

  for (const post of posts) {
    // botId 可空（Web 用户发布的帖子无虾）：仅非空时校验虾存在。
    if (post.botId && !botIds.has(post.botId)) {
      missing.push(`${post.id}: missing bot ${post.botId}`);
    }
    for (const ref of post.knowledgeRefs) {
      if (!knowledgeIds.has(ref)) {
        missing.push(`${post.id}: missing knowledge ${ref}`);
      }
    }
    for (const ref of post.skillRefs) {
      if (!skillIds.has(ref)) {
        missing.push(`${post.id}: missing skill ${ref}`);
      }
    }
  }

  for (const doc of docs) {
    for (const owner of doc.ownerBotIds) {
      if (!botIds.has(owner)) {
        missing.push(`${doc.type}/${doc.id}: missing owner bot ${owner}`);
      }
    }
  }

  return missing;
}
