import fs from "node:fs";
import path from "node:path";
import { getSql } from "../src/lib/db.ts";
import { runMigrations } from "./migrate.ts";
import type { Bot, DocType, MarkdownDoc, Post } from "../src/lib/types.ts";

const rootDir = process.cwd();
const sql = getSql();

await runMigrations(sql);
await seedBots();
await seedDocs("knowledge");
await seedDocs("skills");
await seedPosts();

console.log("Database seeded from local JSON and Markdown content.");

async function seedBots() {
  const bots = readJson<Bot[]>(path.join(rootDir, "src", "data", "bots.json"));
  for (const bot of bots) {
    await sql`
      insert into bots (id, name, role, master, summary, domains)
      values (
        ${bot.id}, ${bot.name}, ${bot.role}, ${bot.master}, ${bot.summary}, ${JSON.stringify(bot.domains)}::jsonb
      )
      on conflict (id) do update set
        name = excluded.name,
        role = excluded.role,
        master = excluded.master,
        summary = excluded.summary,
        domains = excluded.domains
    `;
  }
}

async function seedDocs(type: DocType) {
  for (const doc of readMarkdownDirectory(type)) {
    await sql`
      insert into docs (
        id, doc_type, title, tags, domain, updated_at, owner_bot_ids, summary, body,
        content_state, version, evidence
      )
      values (
        ${doc.id}, ${doc.type}, ${doc.title}, ${JSON.stringify(doc.tags)}::jsonb, ${doc.type === "knowledge" ? doc.domain : null},
        ${doc.updatedAt}, ${JSON.stringify(doc.ownerBotIds)}::jsonb, ${doc.summary}, ${doc.body},
        ${doc.contentState}, ${doc.version}, ${doc.evidence}
      )
      on conflict (id) do update set
        doc_type = excluded.doc_type,
        title = excluded.title,
        tags = excluded.tags,
        domain = excluded.domain,
        updated_at = excluded.updated_at,
        owner_bot_ids = excluded.owner_bot_ids,
        summary = excluded.summary,
        body = excluded.body,
        content_state = excluded.content_state,
        version = excluded.version,
        evidence = excluded.evidence
    `;
  }
}

async function seedPosts() {
  const posts = readJson<Array<Partial<Post> & Post>>(path.join(rootDir, "src", "data", "posts.json"));
  for (const post of posts) {
    await sql`
      insert into posts (
        id, title, summary, bot_id, im_platform, domain, status,
        created_at, resolved_at, fields, timeline
      )
      values (
        ${post.id}, ${post.title}, ${post.summary}, ${post.botId}, ${post.imPlatform},
        ${post.domain}, ${post.status}, ${post.createdAt}, ${post.resolvedAt},
        ${JSON.stringify(post.fields)}::jsonb, ${JSON.stringify(post.timeline)}::jsonb
      )
      on conflict (id) do update set
        title = excluded.title,
        summary = excluded.summary,
        bot_id = excluded.bot_id,
        im_platform = excluded.im_platform,
        domain = excluded.domain,
        status = excluded.status,
        created_at = excluded.created_at,
        resolved_at = excluded.resolved_at,
        fields = excluded.fields,
        timeline = excluded.timeline
    `;

    for (const docId of post.knowledgeRefs) {
      await insertRef(post.id, docId, "knowledge");
    }
    for (const docId of post.skillRefs) {
      await insertRef(post.id, docId, "skills");
    }
  }
}

async function insertRef(postId: string, docId: string, docType: DocType) {
  await sql`
    insert into post_doc_refs (post_id, doc_id, doc_type)
    values (${postId}, ${docId}, ${docType})
    on conflict do nothing
  `;
}

function readMarkdownDirectory(type: DocType): MarkdownDoc[] {
  const dir = type === "knowledge" ? path.join(rootDir, "knowledge") : path.join(rootDir, "skills");
  // 演示种子文档（knowledge/*.md、skills/*.md）已随「清除全部演示种子数据」提交
  // 一并移除（该提交同时引入迁移 019 清种子数据）；目录缺失时返回空，避免
  // readdirSync 抛 ENOENT 使 db:seed 中断。新文档一律经网页/CLI 上传入库。
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parseMarkdownDoc(path.join(dir, file), type));
}

function parseMarkdownDoc(filePath: string, type: DocType): MarkdownDoc {
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter in ${filePath}`);
  }
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index).trim(), parseFrontmatterValue(line.slice(index + 1))];
      }),
  ) as Record<string, string | string[]>;

  const common = {
    id: String(meta.id),
    title: String(meta.title),
    tags: toStringArray(meta.tags),
    updatedAt: String(meta.updatedAt),
    ownerBotIds: toStringArray(meta.ownerBotIds),
    summary: String(meta.summary),
    body: match[2].trim(),
    contentState: (meta.contentState ? String(meta.contentState) : "Approved") as MarkdownDoc["contentState"],
    version: meta.version ? String(meta.version) : null,
    evidence: meta.evidence ? String(meta.evidence) : null,
    authorUserId: null,
  };
  if (type === "skills") {
    return { ...common, type: "skills", scenario: meta.scenario ? String(meta.scenario) : "其他" };
  }
  return {
    ...common,
    type: "knowledge",
    domain: String(meta.domain),
    category: "经验",
    subtype: null,
  };
}

function parseFrontmatterValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function toStringArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
