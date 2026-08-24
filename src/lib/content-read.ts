import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { parse as parseYaml } from "yaml";
import { getOptionalSql } from "./db.ts";
import { botVisibleTo, getVisibilityContext, publicAccountNames } from "./visibility.ts";
import { derivePostStatus } from "./post-replies.ts";
import type { Bot, ContentState, DocAsset, DocAssetMeta, DocType, MarkdownDoc, Post, PostReply, ReplyAttachment } from "./types";

// 内容读取层：行类型与行→领域对象映射、DB / JSON 双路径读取、markdown 回退解析。
// enrich 与统计在 content-enrich.ts / content-stats.ts，经 content.ts 门面对外。

const rootDir = process.cwd();

// 内容状态机的合法取值（§5）。解析外部数据时用它把未知/缺失状态规整为默认值，
// 保证旧数据（无 content_state 列或无 frontmatter 字段）也能安全降级。
const CONTENT_STATES: readonly ContentState[] = ["Approved", "Needs Review", "Needs Attention", "Reviewing"];

function normalizeState(value: unknown, fallback: ContentState): ContentState {
  if (typeof value !== "string") {
    return fallback;
  }
  const match = CONTENT_STATES.find((state) => state.toLowerCase() === value.trim().toLowerCase());
  return match ?? fallback;
}

// 文档默认状态：知识 / 技能均默认 Approved；
// 仅当数据未显式声明状态时使用。
function defaultDocState(): ContentState {
  return "Approved";
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

type BotRow = {
  id: string;
  name: string;
  role: string;
  // master 在迁移 006 后存在；未迁移的旧库可能缺该列 → 运行时为 undefined。
  master?: string;
  // 017 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  owner_user_id?: string | null;
  summary: string;
  domains: string[] | string;
  // 024 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  version?: string | null;
  model?: string | null;
  // 025 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  created_at?: string | null;
};

type DocRow = {
  id: string;
  doc_type: DocType;
  title: string;
  tags: string[] | string;
  domain: string | null;
  category?: string | null;
  subtype?: string | null;
  scenario?: string | null;
  updated_at: string;
  revised_at?: string | null;
  owner_bot_ids: string[] | string;
  summary: string;
  body: string;
  content_state?: string | null;
  version?: string | null;
  evidence?: string | null;
  rejected_at?: string | null;
  rejector?: string | null;
  rejection_reason?: string | null;
  approved_at?: string | null;
  approver?: string | null;
  review_transferred_to_user_id?: string | null;
  review_transferred_at?: string | null;
  review_transferred_by_user_id?: string | null;
  author_user_id?: string | null;
  created_at?: string | null;
};

export type PostRow = {
  id: string;
  title: string;
  summary: string;
  bot_id: string | null;
  im_platform: string;
  domain: string;
  status: Post["status"];
  created_at: string;
  resolved_at: string | null;
  fields: Record<string, string> | string;
  timeline: Post["timeline"] | string;
  // 009 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  reviewed_at?: string | null;
  reviewer?: string | null;
  rejected_at?: string | null;
  rejector?: string | null;
  rejection_reason?: string | null;
  // 013 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  author_user_id?: string | null;
  // 040 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  monitoring_entered_at?: string | null;
};

export type RefRow = {
  post_id: string;
  doc_id: string;
  doc_type: DocType;
};

export type ReplyRow = {
  id: string;
  post_id: string;
  // 033 migration; older databases yield undefined and map to null.
  parent_reply_id?: string | null;
  author_type: "human" | "bot";
  author_name: string;
  author_bot_id: string | null;
  // 012 迁移后存在；未迁移的旧库可能缺列 → 运行时为 undefined。
  author_user_id?: string | null;
  content: string;
  created_at: string;
};

export type ReplyAssetRow = {
  id: string;
  reply_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export type ReplyRefRow = {
  reply_id: string;
  doc_id: string;
  doc_type: DocType;
};

export type ReplyMentionRow = {
  reply_id: string;
  target_type: "user" | "bot";
  target_id: string;
  target_name: string;
};

type DocAssetRow = {
  doc_id: string;
  doc_type: DocType;
  filename: string;
  content_type: string;
  content_base64: string;
  size_bytes: number;
  uploaded_at: string;
};

// JSON 回退路径读取的帖子：旧 JSON 没有 009 引入的 replies/reviewedAt/reviewer，故这三个可选。
type JsonPost = Omit<Post, "replies" | "reviewedAt" | "reviewer"> & {
  replies?: PostReply[];
  reviewedAt?: string | null;
  reviewer?: string | null;
};

function parseMarkdownDoc(filePath: string, type: DocType): MarkdownDoc {
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter in ${filePath}`);
  }

  let parsed: unknown;
  try {
    // failsafe schema keeps every scalar a string (e.g. unquoted dates like
    // 2026-06-06 stay "2026-06-06" instead of becoming Date objects).
    parsed = parseYaml(match[1], { schema: "failsafe" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid frontmatter in ${filePath}: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid frontmatter in ${filePath}: expected a mapping`);
  }
  const meta = parsed as Record<string, string | string[]>;

  const required = type === "knowledge"
    ? ["id", "title", "tags", "domain", "updatedAt", "summary"]
    : ["id", "title", "tags", "updatedAt", "summary"];
  for (const key of required) {
    if (!meta[key]) {
      throw new Error(`Missing ${key} in ${filePath}`);
    }
  }

  const common = {
    id: String(meta.id),
    title: String(meta.title),
    tags: ensureStringArray(meta.tags),
    updatedAt: String(meta.updatedAt),
    ownerBotIds: ensureStringArray(meta.ownerBotIds),
    summary: String(meta.summary),
    body: match[2].trim(),
    contentState: normalizeState(meta.contentState, defaultDocState()),
    version: nullableString(meta.version),
    evidence: nullableString(meta.evidence),
    authorUserId: null,
    createdAt: null,
  };
  if (type === "skills") {
    return { ...common, type: "skills", scenario: meta.scenario ? String(meta.scenario) : "其他" };
  }
  return {
    ...common,
    type: "knowledge",
    domain: String(meta.domain),
    category: meta.category ? String(meta.category) : "经验",
    subtype: meta.subtype ? String(meta.subtype) : null,
  };
}

function readMarkdownDirectory(type: DocType): MarkdownDoc[] {
  const dir = type === "knowledge" ? path.join(rootDir, "knowledge") : path.join(rootDir, "skills");
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parseMarkdownDoc(path.join(dir, file), type))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const getBots = cache(async function getBots(): Promise<Bot[]> {
  const sql = getOptionalSql();
  if (!sql) {
    return readJsonFile<Bot[]>(path.join(rootDir, "src", "data", "bots.json"));
  }

  const rows = (await sql`select * from bots order by name asc`) as BotRow[];
  return rows.map(rowToBot);
});

// 艾特候选名单：虾候选经 botVisibleTo 按当前查看者过滤，用户候选在隔离模式
// 只出演示账号（互通模式全量，行为不变）。viewer 缺省 null（未登录视角），
// 兼容不传 viewer 的既有调用点。
export async function getMentionCandidates(viewerUserId: string | null = null): Promise<Array<{ targetType: "user" | "bot"; targetId: string; name: string }>> {
  const ctx = await getVisibilityContext();
  const bots = (await getBots()).filter((bot) => botVisibleTo(bot, ctx, viewerUserId));
  const botCandidates = bots.map((bot) => ({ targetType: "bot" as const, targetId: bot.id, name: bot.name }));
  const sql = getOptionalSql();
  if (!sql) return botCandidates;
  const names = ctx.isolated ? publicAccountNames() : null;
  const users = names
    ? ((await sql`select id, username from users where username = any(${names}) order by username asc`) as Array<{ id: string; username: string }>)
    : ((await sql`select id, username from users order by username asc`) as Array<{ id: string; username: string }>);
  return [
    ...users.map((user) => ({ targetType: "user" as const, targetId: user.id, name: user.username })),
    ...botCandidates,
  ];
}

export const getPosts = cache(async function getPosts(): Promise<Post[]> {
  const sql = getOptionalSql();
  if (!sql) {
    const raw = readJsonFile<JsonPost[]>(path.join(rootDir, "src", "data", "posts.json"));
    return raw.map(normalizeJsonPost);
  }

  const [postRows, refRows, replyRows, replyAssetRows, replyRefRows, replyMentionRows] = (await Promise.all([
    sql`select * from posts order by created_at desc`,
    sql`select * from post_doc_refs order by post_id asc, doc_id asc`,
    sql`select * from post_replies order by post_id asc, created_at asc`,
    sql`select id, reply_id, filename, content_type, size_bytes, uploaded_at from post_reply_assets`,
    sql`select reply_id, doc_id, doc_type from reply_doc_refs`,
    sql`select reply_id, target_type, target_id, target_name from reply_mentions`,
  ])) as [PostRow[], RefRow[], ReplyRow[], ReplyAssetRow[], ReplyRefRow[], ReplyMentionRow[]];

  const refsByPost = new Map<string, RefRow[]>();
  for (const ref of refRows) {
    refsByPost.set(ref.post_id, [...(refsByPost.get(ref.post_id) ?? []), ref]);
  }
  const repliesByPost = new Map<string, ReplyRow[]>();
  for (const reply of replyRows) {
    repliesByPost.set(reply.post_id, [...(repliesByPost.get(reply.post_id) ?? []), reply]);
  }
  const assetsByReply = groupReplyAssets(replyAssetRows);
  const refsByReply = groupReplyRefsByType(replyRefRows, await getDocs());

  const mentionsByReply = groupReplyMentions(replyMentionRows);
  return postRows.map((row) => rowToPost(row, refsByPost.get(row.id) ?? [], repliesByPost.get(row.id) ?? [], assetsByReply, refsByReply, mentionsByReply));
});

export const getDocs = cache(async function getDocs(type?: DocType): Promise<MarkdownDoc[]> {
  const sql = getOptionalSql();
  if (!sql) {
    const docs = type ? readMarkdownDirectory(type) : [...readMarkdownDirectory("knowledge"), ...readMarkdownDirectory("skills")];
    return docs;
  }

  const rows = type
    ? ((await sql`select * from docs where doc_type = ${type} order by title asc`) as DocRow[])
    : ((await sql`select * from docs order by title asc`) as DocRow[]);
  return rows.map(rowToDoc);
});

export async function getDoc(type: DocType, id: string): Promise<MarkdownDoc | null> {
  return (await getDocs(type)).find((doc) => doc.id === id) ?? null;
}

// 取文档附件（含 base64 内容），用于下载。仅数据库路径可用——无 DB 时附件功能整体不可用，返回 null。
export async function getDocAsset(id: string): Promise<DocAsset | null> {
  const sql = getOptionalSql();
  if (!sql) {
    return null;
  }
  const rows = (await sql`select * from doc_assets where doc_id = ${id}`) as DocAssetRow[];
  const row = rows[0];
  return row ? rowToDocAsset(row) : null;
}

// 取文档下载次数。无数据库或未记录时返回 0（计数功能依赖数据库，与附件功能一致）。
export async function getDocDownloadCount(docId: string): Promise<number> {
  const sql = getOptionalSql();
  if (!sql) {
    return 0;
  }
  const rows = (await sql`select count from doc_download_counts where doc_id = ${docId}`) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

// 取附件元信息（不含 base64 内容），用于页面展示"已上传附件"标识。
export const getDocAssetMetas = cache(async function getDocAssetMetas(): Promise<DocAssetMeta[]> {
  const sql = getOptionalSql();
  if (!sql) {
    return [];
  }
  const rows = (await sql`
    select doc_id, doc_type, filename, content_type, size_bytes, uploaded_at
    from doc_assets
  `) as Array<Omit<DocAssetRow, "content_base64">>;
  return rows.map((row) => ({
    docId: row.doc_id,
    docType: row.doc_type,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
  }));
});

export async function getDocAssetMeta(id: string): Promise<DocAssetMeta | null> {
  return (await getDocAssetMetas()).find((asset) => asset.docId === id) ?? null;
}

function rowToDocAsset(row: DocAssetRow): DocAsset {
  return {
    docId: row.doc_id,
    docType: row.doc_type,
    filename: row.filename,
    contentType: row.content_type,
    contentBase64: row.content_base64,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
  };
}

export const getPost = cache(async function getPost(id: string): Promise<Post | null> {
  const sql = getOptionalSql();
  if (!sql) {
    const posts = await getPosts();
    return posts.find((post) => post.id === id) ?? null;
  }

  const [postRows, refRows, replyRows, replyMentionRows] = (await Promise.all([
    sql`select * from posts where id = ${id}`,
    sql`select * from post_doc_refs where post_id = ${id} order by doc_id asc`,
    sql`select * from post_replies where post_id = ${id} order by created_at asc`,
    sql`select rm.reply_id, rm.target_type, rm.target_id, rm.target_name
      from reply_mentions rm join post_replies r on r.id = rm.reply_id
      where r.post_id = ${id}`,
  ])) as [PostRow[], RefRow[], ReplyRow[], ReplyMentionRow[]];

  const row = postRows[0];
  if (!row) {
    return null;
  }

  // 单帖场景：拉取这些回复的附件与技能引用（回复可能没有，用 in 过滤空集时跳过查询）。
  const replyIds = replyRows.map((reply) => reply.id);
  const replyAssetRows = replyIds.length
    ? ((await sql`
        select id, reply_id, filename, content_type, size_bytes, uploaded_at
        from post_reply_assets where reply_id = any(${replyIds})
      `) as ReplyAssetRow[])
    : [];
  const replyRefRows = replyIds.length
    ? ((await sql`select reply_id, doc_id, doc_type from reply_doc_refs where reply_id = any(${replyIds})`) as ReplyRefRow[])
    : [];
  const assetsByReply = groupReplyAssets(replyAssetRows);
  const refsByReply = groupReplyRefsByType(replyRefRows, await getDocs());
  const mentionsByReply = groupReplyMentions(replyMentionRows);

  return rowToPost(row, refRows, replyRows, assetsByReply, refsByReply, mentionsByReply);
});

// 取回复附件（含 base64 内容），用于下载。仅数据库路径可用。
export async function getReplyAsset(
  assetId: string,
): Promise<{ filename: string; contentType: string; contentBase64: string } | null> {
  const sql = getOptionalSql();
  if (!sql) {
    return null;
  }
  const rows = (await sql`
    select filename, content_type, content_base64 from post_reply_assets where id = ${assetId}
  `) as Array<{ filename: string; content_type: string; content_base64: string }>;
  const row = rows[0];
  return row
    ? { filename: row.filename, contentType: row.content_type, contentBase64: row.content_base64 }
    : null;
}

// 反查回复附件所属的帖子 id（附件 → 回复 → 帖子），供下载路由做帖子级可见性守卫。
// 仅数据库路径可用（JSON 回退无附件）。
export async function getReplyAssetPostId(assetId: string): Promise<string | null> {
  const sql = getOptionalSql();
  if (!sql) {
    return null;
  }
  const rows = (await sql`
    select r.post_id
    from post_reply_assets a join post_replies r on r.id = a.reply_id
    where a.id = ${assetId}
  `) as Array<{ post_id: string }>;
  return rows[0]?.post_id ?? null;
}

// 批量取发布者用户名：把帖子列表里所有非空 authorUserId 一次查回，供 enrichPost 派生
// authorUsername。无数据库时返回空 Map（历史 / 种子帖 authorUserId 均为 null，无需解析；
// 登录写入路径依赖数据库，故 authorUserId 非空必在 DB 模式下）。
export async function fetchUsernames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const sql = getOptionalSql();
  if (!sql) {
    return new Map();
  }
  const rows = (await sql`select id, username from users where id = any(${userIds})`) as Array<{
    id: string;
    username: string;
  }>;
  return new Map(rows.map((row) => [row.id, row.username]));
}

// 取单个用户名：文档详情页等需要展示发布者署名的场景。无数据库 / 用户不存在 / 传 null 时返回 null。
export async function getUsername(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  return (await fetchUsernames([userId])).get(userId) ?? null;
}

// 角色枚举（个人虾 / 岗位虾）。旧库的 role 可能是自由文本（如"故障路由虾"），
// 一律归一到岗位虾，保证历史数据也能安全加载。
function normalizeBotRole(value: unknown): Bot["role"] {
  return value === "个人虾" ? "个人虾" : "岗位虾";
}

// 简介字数上限 20（schema .max(20) 自 2026-08-13 起生效）。更早写入的历史数据可能
// 超长：读取时规整为空串，展示层据此显示占位文案「这只虾还没有简介。」。
// 导出便于单测，避开 DB。
export function normalizeBotSummary(value: string): string {
  return value.length > 20 ? "" : value;
}

function rowToBot(row: BotRow): Bot {
  return {
    id: row.id,
    name: row.name,
    role: normalizeBotRole(row.role),
    master: row.master ?? "",
    ownerUserId: row.owner_user_id ?? null,
    summary: normalizeBotSummary(row.summary),
    domains: ensureStringArray(row.domains),
    version: row.version ?? "",
    model: row.model ?? "",
    createdAt: row.created_at ?? null,
  };
}

export function rowToDoc(row: DocRow): MarkdownDoc {
  const common = {
    id: row.id,
    title: row.title,
    tags: ensureStringArray(row.tags),
    updatedAt: row.updated_at,
    revisedAt: row.revised_at ?? null,
    ownerBotIds: ensureStringArray(row.owner_bot_ids),
    summary: row.summary,
    body: row.body,
    contentState: normalizeState(row.content_state, defaultDocState()),
    version: nullableString(row.version),
    evidence: nullableString(row.evidence),
    rejectedAt: row.rejected_at ?? null,
    rejector: row.rejector ?? null,
    rejectionReason: row.rejection_reason ?? null,
    approvedAt: row.approved_at ?? null,
    approver: row.approver ?? null,
    reviewTransferredToUserId: row.review_transferred_to_user_id ?? null,
    reviewTransferredAt: row.review_transferred_at ?? null,
    reviewTransferredByUserId: row.review_transferred_by_user_id ?? null,
    authorUserId: row.author_user_id ?? null,
    createdAt: row.created_at ?? null,
  };
  if (row.doc_type === "skills") {
    return { ...common, type: "skills", scenario: row.scenario ?? "其他" };
  }
  return {
    ...common,
    type: "knowledge",
    domain: row.domain ?? "",
    category: row.category ?? "经验",
    subtype: row.subtype ?? null,
  };
}

export function rowToPost(
  row: PostRow,
  refs: RefRow[],
  replies: ReplyRow[] = [],
  assetsByReply: Map<string, ReplyAttachment[]> = new Map(),
  refsByReply: Map<string, ReplyRefGroups> = new Map(),
  mentionsByReply: Map<string, PostReply["mentionRefs"]> = new Map(),
): Post {
  const replyList = replies.map((reply) =>
    rowToReply(reply, assetsByReply.get(reply.id) ?? [], refsByReply.get(reply.id) ?? { skills: [], knowledge: [] }, mentionsByReply.get(reply.id) ?? []),
  );
  const reviewedAt = row.reviewed_at ?? null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    botId: row.bot_id ?? null,
    imPlatform: row.im_platform,
    domain: row.domain,
    status: derivePostStatus(replyList, reviewedAt, row.status),
    createdAt: row.created_at,
    resolvedAt: reviewedAt ?? row.resolved_at ?? null,
    knowledgeRefs: refs.filter((ref) => ref.doc_type === "knowledge").map((ref) => ref.doc_id),
    skillRefs: refs.filter((ref) => ref.doc_type === "skills").map((ref) => ref.doc_id),
    fields: ensureRecord(row.fields),
    timeline: ensureTimeline(row.timeline),
    replies: replyList,
    reviewedAt,
    reviewer: row.reviewer ?? null,
    authorUserId: row.author_user_id ?? null,
    monitoringEnteredAt: row.monitoring_entered_at ?? null,
  };
}

function rowToReply(
  row: ReplyRow,
  attachments: ReplyAttachment[] = [],
  groups: ReplyRefGroups = { skills: [], knowledge: [] },
  mentionRefs: PostReply["mentionRefs"] = [],
): PostReply {
  return {
    id: row.id,
    parentReplyId: row.parent_reply_id ?? null,
    authorType: row.author_type,
    authorName: row.author_name,
    authorBotId: row.author_bot_id ?? null,
    authorUserId: row.author_user_id ?? null,
    content: row.content,
    createdAt: row.created_at,
    attachments,
    skillRefs: groups.skills,
    knowledgeRefs: groups.knowledge,
    mentionRefs,
  };
}

export type ReplyRefGroups = {
  skills: { id: string; title: string }[];
  knowledge: { id: string; title: string }[];
};

function groupReplyMentions(rows: ReplyMentionRow[]): Map<string, PostReply["mentionRefs"]> {
  const result = new Map<string, PostReply["mentionRefs"]>();
  for (const row of rows) {
    const list = result.get(row.reply_id) ?? [];
    list.push({ targetType: row.target_type, targetId: row.target_id, name: row.target_name });
    result.set(row.reply_id, list);
  }
  return result;
}

// 把 reply_doc_refs 行按 reply_id 分组，并关联 docs 取 title，按 doc_type 拆 skills / knowledge。
export function groupReplyRefsByType(
  refRows: ReplyRefRow[],
  docs: MarkdownDoc[],
): Map<string, ReplyRefGroups> {
  const titleById = new Map(docs.map((doc) => [doc.id, doc.title] as const));
  const map = new Map<string, ReplyRefGroups>();
  for (const ref of refRows) {
    const groups = map.get(ref.reply_id) ?? { skills: [], knowledge: [] };
    const entry = { id: ref.doc_id, title: titleById.get(ref.doc_id) ?? ref.doc_id };
    if (ref.doc_type === "skills") {
      groups.skills.push(entry);
    } else if (ref.doc_type === "knowledge") {
      groups.knowledge.push(entry);
    }
    map.set(ref.reply_id, groups);
  }
  return map;
}

// 把附件行按 reply_id 聚合成 ReplyAttachment[]（不含 base64 内容）。
function groupReplyAssets(rows: ReplyAssetRow[]): Map<string, ReplyAttachment[]> {
  const map = new Map<string, ReplyAttachment[]>();
  for (const row of rows) {
    const attachment: ReplyAttachment = {
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      uploadedAt: row.uploaded_at,
    };
    map.set(row.reply_id, [...(map.get(row.reply_id) ?? []), attachment]);
  }
  return map;
}

// JSON 回退路径：旧 JSON 没有 replies/reviewedAt/reviewer 字段，补默认值并派生状态，
// 让无 DB 的本地环境也跑同一套状态机。新写入的回复只进数据库；JSON 路径只读。
function normalizeJsonPost(post: JsonPost): Post {
  // 旧 JSON 的回复没有 attachments / skillRefs 字段，补空数组。
  const replies = (post.replies ?? []).map((reply) => ({
    ...reply,
    attachments: reply.attachments ?? [],
    skillRefs: reply.skillRefs ?? [],
  }));
  const reviewedAt = post.reviewedAt ?? null;
  return {
    ...post,
    replies,
    reviewedAt,
    reviewer: post.reviewer ?? null,
    authorUserId: post.authorUserId ?? null,
    status: derivePostStatus(replies, reviewedAt, post.status),
    resolvedAt: reviewedAt ?? post.resolvedAt ?? null,
  };
}

function ensureStringArray(value: string[] | string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(value)];
  } catch {
    return [String(value)];
  }
}

function ensureRecord(value: Record<string, string> | string): Record<string, string> {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function ensureTimeline(value: Post["timeline"] | string): Post["timeline"] {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Post["timeline"]) : [];
  } catch {
    return [];
  }
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
