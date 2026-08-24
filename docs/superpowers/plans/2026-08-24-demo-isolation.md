# 公开演示隔离模式（Demo Isolation）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 默认启用隔离模式——用户仅可见「演示账号发布的内容 + 自己的内容」，打断用户间互通渠道；`DEMO_ISOLATION=false` 时回到现行全站互通。

**Architecture:** 新建 `src/lib/visibility.ts`（唯一事实源：env 解析 + 纯函数判定）与 `src/lib/visible-content.ts`（viewer 作用域的读取包装）。页面 / API / 机器接口在取数处传当前用户；写路径在服务入口做可见性守卫，越界响应与「资源不存在」不可区分。不改数据库 schema。

**Tech Stack:** Next.js 16 App Router、React 19 RSC、`pg`、`node:test`（`tests/run-tests.ts` 显式注册）。

**Spec:** `docs/superpowers/specs/2026-08-24-demo-isolation-design.md`

## Global Constraints

- 工作目录**不是 git 仓库**：跳过所有 commit 步骤，以「任务完成 + 测试通过」为检查点。
- `DEMO_ISOLATION` 默认 `true`；仅显式 `false` / `0` 关闭；非法值按 `true`（fail-safe 为隔离）。
- `DEMO_PUBLIC_ACCOUNTS` 默认 `用户1,用户2`（逗号分隔；查不到的用户名静默忽略）。
- 可见 ⇔ 作者/归属者 ∈ publicUserIds ∪ {viewerUserId}；未登录 viewerUserId=null；admin 无特权。
- 越界响应必须与「资源不存在」同构（详情 404；回复/评论沿用各自现行「不存在」错误文案）。
- 存量 605 个测试按互通假设写成：测试进程设 `DEMO_ISOLATION=false` 跑；隔离行为用新增测试覆盖（纯函数注入 ctx，不依赖进程 env）。
- 新测试文件必须在 `tests/run-tests.ts` 注册一行。
- 注释风格：中文、说明 why，与现有代码一致。

---

### Task 1: `visibility.ts` 核心模块（env 解析 + 纯函数）

**Files:**
- Create: `src/lib/visibility.ts`
- Create: `tests/visibility.test.ts`
- Create: `tests/test-env.ts`
- Modify: `tests/run-tests.ts`（顶部加一行 import）

**Interfaces:**
- Produces（后续任务全部依赖）:
  - `type VisibilityContext = { isolated: boolean; publicUserIds: Set<string> }`
  - `isolationEnabled(env?): boolean`、`publicAccountNames(env?): string[]`
  - `getVisibilityContext(): Promise<VisibilityContext>`（TTL 10s 缓存 + `__resetVisibilityCacheForTests()`）
  - `postVisibleTo(post, botOwnerUserId, ctx, viewerUserId): boolean`
  - `docVisibleTo(doc, botsById: Map<string, Bot>, ctx, viewerUserId): boolean`
  - `botVisibleTo(bot, ctx, viewerUserId): boolean`
  - `replyVisibleTo(reply, botsById: Map<string, Bot>, ctx, viewerUserId): boolean`

- [ ] **Step 1: 写测试环境的 env 垫片**

`tests/test-env.ts`（新建）：

```ts
// 测试进程默认跑互通模式：存量 605 个测试全部按「全站互通」假设写成。
// 隔离行为由 visibility.test.ts 注入 ctx / env 覆盖，不依赖进程环境。
// 注意：ES 模块依赖按 import 顺序求值，本文件必须是 run-tests.ts 的第一个 import。
process.env.DEMO_ISOLATION = process.env.DEMO_ISOLATION ?? "false";
```

`tests/run-tests.ts` 第 1 行（在其他 import 之前）加：

```ts
import "./test-env.ts";
```

- [ ] **Step 2: 写失败测试**

`tests/visibility.test.ts`（新建）：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isolationEnabled, publicAccountNames, postVisibleTo, docVisibleTo, botVisibleTo, replyVisibleTo } from "../src/lib/visibility.ts";
import type { Bot, MarkdownDoc, Post, PostReply } from "../src/lib/types.ts";

const DEMO = "u-demo";
const ALICE = "u-alice";

const ctxOn = { isolated: true, publicUserIds: new Set([DEMO]) };
const ctxOff = { isolated: false, publicUserIds: new Set<string>() };

const bot = (ownerUserId: string | null): Bot => ({
  id: "b1", name: "虾一", role: "岗位虾", master: "", summary: "", domains: ["运维与部署"],
  version: "1.0", model: "m", ownerUserId, createdAt: new Date().toISOString(),
});

const post = (over: Partial<Post> = {}): Post => ({
  id: "p1", title: "t", summary: "s", botId: null, imPlatform: "未指定", domain: "其他",
  status: "open", createdAt: new Date().toISOString(), resolvedAt: null,
  knowledgeRefs: [], skillRefs: [], fields: { problemType: "a", triggerScenario: "b", triedMethods: "c", currentResult: "d" },
  timeline: [], replies: [], reviewedAt: null, reviewer: null, authorUserId: null, ...over,
});

const doc = (over: Partial<MarkdownDoc> = {}): MarkdownDoc => ({
  id: "d1", type: "knowledge", title: "t", tags: [], updatedAt: "2026-08-24", ownerBotIds: [],
  summary: "s", body: "b", contentState: "Approved", version: "1.0.0", evidence: null,
  authorUserId: null, ...over,
} as MarkdownDoc);

const reply = (over: Partial<PostReply> = {}): PostReply => ({
  id: "r1", postId: "p1", content: "c", authorType: "human", authorName: "n",
  createdAt: new Date().toISOString(), attachments: [], knowledgeRefs: [], skillRefs: [],
  mentionRefs: [], parentReplyId: null, authorUserId: null, authorBotId: null, ...over,
} as PostReply);

test("isolationEnabled：默认 true，仅显式 false/0 关闭，非法值 fail-safe 为隔离", () => {
  assert.equal(isolationEnabled({}), true);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "false" }), false);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "0" }), false);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "true" }), true);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "随便" }), true);
});

test("publicAccountNames：默认 用户1,用户2，逗号分隔去空白", () => {
  assert.deepEqual(publicAccountNames({}), ["用户1", "用户2"]);
  assert.deepEqual(publicAccountNames({ DEMO_PUBLIC_ACCOUNTS: " a , b ,," }), ["a", "b"]);
});

test("postVisibleTo：隔离模式下按作者/虾 owner 判定，admin 无特权，未登录只见演示", () => {
  const demoPost = post({ authorUserId: DEMO });
  const alicePost = post({ authorUserId: ALICE });
  const aliceBotPost = post({ botId: "b1" }); // 虾 owner 为 ALICE
  const seedPost = post(); // 历史种子：无作者无虾

  assert.equal(postVisibleTo(demoPost, null, ctxOn, null), true);          // 未登录见演示
  assert.equal(postVisibleTo(alicePost, null, ctxOn, null), false);        // 未登录不见他人
  assert.equal(postVisibleTo(alicePost, null, ctxOn, ALICE), true);        // 自己见自己
  assert.equal(postVisibleTo(alicePost, null, ctxOn, "u-admin"), false);   // admin 无特权
  assert.equal(postVisibleTo(aliceBotPost, ALICE, ctxOn, ALICE), true);    // 虾帖 owner 可见
  assert.equal(postVisibleTo(aliceBotPost, ALICE, ctxOn, DEMO), false);
  assert.equal(postVisibleTo(seedPost, null, ctxOn, DEMO), false);         // 无主内容无人可见
  // 互通模式恒真
  for (const viewer of [null, ALICE, "u-admin"]) {
    assert.equal(postVisibleTo(alicePost, null, ctxOff, viewer), true);
  }
});

test("docVisibleTo：作者或 ownerBotIds 对应虾的 owner 命中即可见", () => {
  const botsById = new Map([["b1", bot(DEMO)], ["b2", bot(ALICE)]]);
  assert.equal(docVisibleTo(doc({ authorUserId: DEMO }), botsById, ctxOn, null), true);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b2"] }), botsById, ctxOn, ALICE), true);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b2"] }), botsById, ctxOn, null), false);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b1"] }), botsById, ctxOn, null), true); // 演示虾的文档
});

test("botVisibleTo：虾 owner ∈ 演示 ∪ 自己", () => {
  assert.equal(botVisibleTo(bot(DEMO), ctxOn, null), true);
  assert.equal(botVisibleTo(bot(ALICE), ctxOn, ALICE), true);
  assert.equal(botVisibleTo(bot(ALICE), ctxOn, DEMO), false);
  assert.equal(botVisibleTo(bot(null), ctxOn, ALICE), false); // 历史种子虾不可见
});

test("replyVisibleTo：人类回复看 authorUserId，虾回复看虾 owner", () => {
  const botsById = new Map([["b1", bot(ALICE)]]);
  assert.equal(replyVisibleTo(reply({ authorUserId: ALICE }), botsById, ctxOn, ALICE), true);
  assert.equal(replyVisibleTo(reply({ authorUserId: ALICE }), botsById, ctxOn, DEMO), false);
  assert.equal(replyVisibleTo(reply({ authorType: "bot", authorBotId: "b1" }), botsById, ctxOn, ALICE), true);
  assert.equal(replyVisibleTo(reply({ authorType: "bot", authorBotId: "b1" }), botsById, ctxOn, null), false);
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../src/lib/visibility.ts'`

- [ ] **Step 4: 实现 `src/lib/visibility.ts`**

```ts
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
```

在 `tests/run-tests.ts` 注册：`import "./visibility.test.ts";`

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: PASS（存量测试因 `test-env.ts` 跑在互通模式，行为不变；新增 6 个用例全绿）

---

### Task 2: `visible-content.ts` 读取包装（viewer 作用域列表 / 详情 / 统计）

**Files:**
- Create: `src/lib/visible-content.ts`
- Create: `tests/visible-content.test.ts`
- Modify: `tests/run-tests.ts`（注册）

**Interfaces:**
- Consumes: Task 1 全部导出；`content-read.ts` 现有 `getBots/getPosts/getPost/getDocs/fetchUsernames`；`content-enrich.ts` 的 `enrichPost`；`content-stats.ts` 的 `computeStats`。
- Produces:
  - `getVisibleBots(viewer: SessionUser | null): Promise<Bot[]>`
  - `getVisibleDocs(viewer, type?: DocType): Promise<MarkdownDoc[]>`
  - `getVisibleEnrichedPosts(viewer): Promise<EnrichedPost[]>`（含回复过滤）
  - `getVisiblePostDetail(id, viewer): Promise<EnrichedPost | null>`（帖子不可见返回 null）
  - `getVisibleStats(viewer): Promise<OverviewStats>`

- [ ] **Step 1: 写失败测试**

`tests/visible-content.test.ts`（新建）——JSON 回退路径下 `getVisibilityContext` 公共区为空、测试进程 `DEMO_ISOLATION=false`，因此本文件只测「互通透传」与「隔离空公共区」两条可离线验证的路径；判定矩阵已由 visibility.test.ts 覆盖：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleBots, getVisibleEnrichedPosts, getVisibleStats } from "../src/lib/visible-content.ts";

test("互通模式：包装函数透传读取层全量数据", async () => {
  const bots = await getVisibleBots(null);
  const posts = await getVisibleEnrichedPosts(null);
  const stats = await getVisibleStats(null);
  assert.ok(Array.isArray(bots));
  assert.ok(Array.isArray(posts));
  assert.ok(typeof stats === "object");
});

test("隔离模式（无 DB）：公共区为空，未登录不可见任何内容", async () => {
  process.env.DEMO_ISOLATION = "true";
  try {
    const posts = await getVisibleEnrichedPosts(null);
    assert.equal(posts.length, 0);
    const bots = await getVisibleBots(null);
    assert.equal(bots.length, 0);
  } finally {
    process.env.DEMO_ISOLATION = "false";
  }
});
```

注意：`getVisibilityContext` 有 10s TTL 缓存，测试改 env 后需先 `__resetVisibilityCacheForTests()`（在两个用例开头各调一次，从 visibility.ts import）。

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——`Cannot find module '../src/lib/visible-content.ts'`

- [ ] **Step 3: 实现 `src/lib/visible-content.ts`**

```ts
// viewer 作用域的读取包装：列表 / 详情 / 统计先经可见性过滤，再进 enrich 管线。
// 回复过滤必须在 enrich 之前——enrichPost 会把回复引用的文档提升进帖级 knowledge/skills，
// 先过滤回复可保证不可见回复的引用不进入富化结果。
import { getBots, getDocs, getPost, getPosts, fetchUsernames } from "./content-read.ts";
import { enrichPost } from "./content-enrich.ts";
import { computeStats } from "./content-stats.ts";
import { getVisibilityContext, postVisibleTo, docVisibleTo, botVisibleTo, replyVisibleTo } from "./visibility.ts";
import type { Bot, DocType, EnrichedPost, MarkdownDoc, OverviewStats, Post } from "./types";
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
```

在 `tests/run-tests.ts` 注册：`import "./visible-content.test.ts";`

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

---

### Task 3: 页面与网页 API 接入可见性

**Files:**
- Modify: `src/app/page.tsx:31`（总览）
- Modify: `src/app/api/posts/route.ts:9-17`（列表 GET）
- Modify: `src/app/posts/[id]/page.tsx:28,38,48`
- Modify: `src/app/library/page.tsx:13`
- Modify: `src/app/library/[type]/[id]/page.tsx`（详情 + 引用列表）
- Modify: `src/app/bots/[id]/page.tsx:26-39`
- Modify: `src/app/api/docs/[type]/[id]/comments/route.ts`（GET 评论）
- Modify: `src/app/api/docs/[type]/[id]/download/route.ts`
- Test: `tests/page-visibility.test.ts`（新增，注册）

**Interfaces:**
- Consumes: Task 2 的 `getVisible*`；`getUserFromCookie`（`src/lib/services/session.ts`）、`cookies()`（`next/headers`）——页面取当前用户的既有模式：`hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null`（见 `library/[type]/[id]/page.tsx:79`）。路由侧用 `getCurrentUser(request)`。

- [ ] **Step 1: 写失败测试（路由级，最小可离线验证）**

`tests/page-visibility.test.ts`（新建）——离线（无 DB）只能断言「包装函数被页面引用 + 互通模式行为不变」；隔离模式的路由行为在 Task 6 靠 `DEMO_ISOLATION=true` 手动冒烟（Step 见 Task 6）。测试主体改为**静态断言**（项目已有此类先例，如 `tests/lan-dev-origin.test.ts`、`tests/help-page-cta.test.ts`）：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 静态断言：页面 / 列表 API 必须经由 visible-content 包装取数（隔离模式的接入面）。
test("总览与列表页接入可见性包装", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  assert.ok(home.includes("getVisibleEnrichedPosts"), "总览页应使用 getVisibleEnrichedPosts");
  assert.ok(home.includes("getVisibleStats"), "总览页应使用 getVisibleStats");

  const postsApi = readFileSync("src/app/api/posts/route.ts", "utf8");
  assert.ok(postsApi.includes("getVisibleEnrichedPosts"), "/api/posts GET 应使用 getVisibleEnrichedPosts");

  const library = readFileSync("src/app/library/page.tsx", "utf8");
  assert.ok(library.includes("getVisibleDocs"), "知识库列表应使用 getVisibleDocs");

  const botsPage = readFileSync("src/app/bots/[id]/page.tsx", "utf8");
  assert.ok(botsPage.includes("getVisible"), "虾详情页应使用可见包装");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL——页面尚未引用 `getVisible*`

- [ ] **Step 3: 逐页接入**

统一模式（每个文件三处改动：import 加 `getVisible*`；取当前用户；调用处替换）。

`src/app/page.tsx`：

```ts
// import 区
import { getVisibleBots, getVisibleDocs, getVisibleEnrichedPosts, getVisibleStats } from "@/lib/visible-content";
// 取数处（原第 31 行）——页面无既有 currentUser 则按库详情页模式补：
const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
const [posts, bots, docs, stats] = await Promise.all([
  getVisibleEnrichedPosts(currentUser),
  getVisibleBots(currentUser),
  getVisibleDocs(currentUser),
  getVisibleStats(currentUser),
]);
```

（`hasDatabase` 与 `getUserFromCookie` 的 import、`cookies` 的 import 参照 `src/app/library/[type]/[id]/page.tsx` 现有写法。）

`src/app/api/posts/route.ts` GET：

```ts
import { getCurrentUser } from "@/lib/services/session";
import { getVisibleEnrichedPosts } from "@/lib/visible-content";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request);
  const posts = await getVisibleEnrichedPosts(currentUser);
  return NextResponse.json({ posts, version: getPostListVersion(posts) });
}
```

`src/app/posts/[id]/page.tsx`：`getEnrichedPost(id)` 两处（`generateMetadata` 与页组件）改为：

```ts
const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
const post = await getVisiblePostDetail(id, currentUser);
```

页内 `getDocs()`（回复面板的知识引用候选）改为 `getVisibleDocs(currentUser)`。

`src/app/library/page.tsx`：`getDocs()` → `getVisibleDocs(currentUser)`；`getBots()` → `getVisibleBots(currentUser)`；页面若展示「引用此文档的帖子」（`getDocReferences`），改为 `(await getVisibleEnrichedPosts(currentUser)).filter((post) => postReferencesDoc(post, doc.id))`。

`src/app/library/[type]/[id]/page.tsx`：`getDoc(type, id)` 取回后追加：

```ts
const botsById = new Map((await getBots()).map((bot) => [bot.id, bot] as const));
const ctx = await getVisibilityContext();
if (!docVisibleTo(doc, botsById, ctx, currentUser?.id ?? null)) notFound();
```

（`docAssetMetas` / `getDocReferences` 的展示同样经可见帖子过滤。）

`src/app/bots/[id]/page.tsx`：

```ts
const bot = (await getVisibleBots(currentUser)).find((item) => item.id === id);
if (!bot) notFound();
// 该虾的帖子 / 文档：
const posts = (await getVisibleEnrichedPosts(currentUser)).filter((post) => post.botId === bot.id);
const docs = (await getVisibleDocs(currentUser)).filter((doc) => doc.ownerBotIds.includes(bot.id));
```

`src/app/api/docs/[type]/[id]/comments/route.ts` GET 与 `download/route.ts`：入口处（现有「Approved 才可读 / 下载」判定之前）加同一 `docVisibleTo` 守卫，不可见返回该入口现行「不存在」响应（404）。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（含新增静态断言）

- [ ] **Step 5: 本地冒烟（互通模式回归）**

Run: `npm run dev`（外部终端），`curl http://127.0.0.1:3000/api/posts` 匿名请求
Expected: 与改造前同构（互通模式下行为零变化）

---

### Task 4: 写路径守卫与用户名暴露面收口

**Files:**
- Modify: `src/lib/services/post-service.ts`（`addReply`）
- Modify: `src/lib/services/doc-comment-service.ts`（`createDocComment`）
- Modify: `src/lib/content-read.ts:248`（`getMentionCandidates`）
- Modify: `src/app/api/users/route.ts`
- Test: `tests/write-path-visibility.test.ts`（新增，注册）

**Interfaces:**
- Consumes: Task 1 `getVisibilityContext/postVisibleTo/docVisibleTo/botVisibleTo`。
- Produces: `getMentionCandidates(viewerUserId: string | null)`——**签名变更**（可选参数；调用点 `posts/[id]/page.tsx`、`library/[type]/[id]/page.tsx` 同步传 viewer）。

- [ ] **Step 1: 写失败测试**

`tests/write-path-visibility.test.ts`（新建）：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("addReply 入口有可见性守卫", () => {
  const src = readFileSync("src/lib/services/post-service.ts", "utf8");
  assert.ok(src.includes("postVisibleTo"), "addReply 应在写入前做帖子可见性判定");
});

test("createDocComment 入口有可见性守卫", () => {
  const src = readFileSync("src/lib/services/doc-comment-service.ts", "utf8");
  assert.ok(src.includes("docVisibleTo"), "createDocComment 应在写入前做文档可见性判定");
});

test("用户名单接口在隔离模式只回演示账号", () => {
  const src = readFileSync("src/app/api/users/route.ts", "utf8");
  assert.ok(src.includes("publicAccountNames") || src.includes("getVisibilityContext"),
    "/api/users 应按隔离模式过滤");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test` Expected: FAIL

- [ ] **Step 3: 实现**

`post-service.ts` `addReply`（在「post not found」判定之后、作者解析之前插入）：

```ts
// 可见性守卫：目标帖对回复者（人类=本人；虾=虾 owner）不可见时，与「帖子不存在」同响应，
// 不泄露存在性。互通模式 postVisibleTo 恒真，行为不变。
const viewerForVisibility = value.authorType === "bot"
  ? bots.find((b) => b.id === value.authorBotId)?.ownerUserId ?? null
  : currentUser?.id ?? null;
const visCtx = await getVisibilityContext();
const postBotOwner = post.botId ? (bots.find((b) => b.id === post.botId)?.ownerUserId ?? null) : null;
if (!postVisibleTo(post, postBotOwner, visCtx, viewerForVisibility)) {
  return { ok: false, error: `post not found: ${postId}` };
}
```

`doc-comment-service.ts` `createDocComment`（取到 doc 后同样模式）：

```ts
const viewerForVisibility = bot ? bot.owner.id : currentUser?.id ?? null;
const [visBots, visCtx] = await Promise.all([getBots(), getVisibilityContext()]);
const botsById = new Map(visBots.map((b) => [b.id, b] as const));
if (!docVisibleTo(doc, botsById, visCtx, viewerForVisibility)) {
  return { ok: false, status: 404, error: `文档不存在：${docType}/${docId}` }; // 与该入口不存在语义同构
}
```

`content-read.ts` `getMentionCandidates`：

```ts
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
  return [...users.map((user) => ({ targetType: "user" as const, targetId: user.id, name: user.username })), ...botCandidates];
}
```

两个页面调用点传 `currentUser?.id ?? null`。

`src/app/api/users/route.ts` GET（rows 查询替换）：

```ts
import { getVisibilityContext, publicAccountNames } from "@/lib/visibility";

const ctx = await getVisibilityContext();
const rows = ctx.isolated
  ? (await sql`select id, username from users where username = any(${publicAccountNames()}) order by username asc`)
  : (await sql`select id, username from users order by username asc`);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test` Expected: PASS

---

### Task 5: 机器接口（虾 API）接入

**Files:**
- Modify: `src/app/api/bot/posts/list/route.ts`
- Modify: `src/app/api/bot/posts/detail/route.ts`
- Modify: `src/app/api/bot/docs/list/route.ts`
- Modify: `src/app/api/bot/docs/detail/route.ts`
- Modify: `src/app/api/bot/docs/comments/route.ts`（GET 语义）
- Modify: `src/app/api/bot/posts/[id]/replies/route.ts`（无需改——守卫已在 `addReply`，验证即可）
- Test: `tests/bot-api-visibility.test.ts`（新增，注册）

**Interfaces:**
- Consumes: Task 2 `getVisibleEnrichedPosts/getVisiblePostDetail/getVisibleDocs`；Task 1 `docVisibleTo`；`authenticateBotRequest` 返回的 `principal.owner: { id, username, role }`。

- [ ] **Step 1: 写失败测试**

`tests/bot-api-visibility.test.ts`（新建，静态断言 + 回复守卫复用验证）：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("机器接口读路径接入可见包装", () => {
  assert.ok(readFileSync("src/app/api/bot/posts/list/route.ts", "utf8").includes("getVisibleEnrichedPosts"));
  assert.ok(readFileSync("src/app/api/bot/docs/list/route.ts", "utf8").includes("getVisibleDocs"));
  assert.ok(readFileSync("src/app/api/bot/posts/detail/route.ts", "utf8").includes("getVisiblePostDetail"));
});

test("机器接口详情/评论有 docVisibleTo 守卫", () => {
  assert.ok(readFileSync("src/app/api/bot/docs/detail/route.ts", "utf8").includes("docVisibleTo"));
  assert.ok(readFileSync("src/app/api/bot/docs/comments/route.ts", "utf8").includes("docVisibleTo"));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test` Expected: FAIL

- [ ] **Step 3: 实现**

`bot/posts/list/route.ts`：`getEnrichedPosts()` → `getVisibleEnrichedPosts(auth.principal.owner)`。

`bot/posts/detail/route.ts`：帖子查找改为 `getVisiblePostDetail(postId, auth.principal.owner)`；null 时保持现行 404 文案。

`bot/docs/list/route.ts`：缺省分支 `getDocs()` → `getVisibleDocs(auth.principal.owner)`（`Approved` 过滤逻辑不动）；`mine: true` 分支不变（本来就只回自己的）。

`bot/docs/detail/route.ts`：现有「Approved 任何人可读 / 自己的未批准可读」判定前加：

```ts
const botsById = new Map((await getBots()).map((b) => [b.id, b] as const));
const ctx = await getVisibilityContext();
if (!docVisibleTo(doc, botsById, ctx, auth.principal.owner.id)) {
  return NextResponse.json({ ok: false, error: `文档不存在：${type}/${docId}` }, { status: 404 });
}
```

`bot/docs/comments/route.ts`：同上守卫（对齐该入口不存在语义）。

`bot/posts/[id]/replies/route.ts`：**不改代码**——跑测试确认 `addReply` 守卫已覆盖（虾回复走 `authorBotId` → owner 视角）。

引用校验（`publishPost` / `addReply` 的 `knowledgeRefs`/`skillRefs`）：在 `post-service.ts` 两处调用 `validatePostReferences` 前，把传入的 docs 列表先过滤为可见集：

```ts
const visible = ctx.isolated ? docs.filter((d) => docVisibleTo(d, botsById, ctx, viewerId)) : docs;
```

不可见文档自然落入 `unknown knowledgeRefs/skillRefs` 分支——与「不存在」同构，无新错误码。

- [ ] **Step 4: 运行确认通过**

Run: `npm test` Expected: PASS

---

### Task 6: 配置文档、契约同步与全量回归

**Files:**
- Modify: `.env.example`（加两个变量）
- Modify: `CLAUDE.md`（环境变量表 + 鉴权模型节 + 首位一段「公开演示隔离模式」）
- Modify: `docs/cli/bot-integration.md`、`.claude/skills/lobster-mcp/SKILL.md`、`tools.md`（隔离说明一句；受 `tests/cli-contract-consistency.test.ts` 锁定——三处同句）
- Modify: `虾塘—帮助文档.md`（新章节或并入现有章节，**保持 20 个一级章节结构**，`tests/help-doc.test.ts` 会锁）
- Create: `announcements/announcement-2026-08-24.md`（若当日已有公告文件则并入）
- Modify: `src/lib/services/schemas.ts` **不改**；无数据库迁移

**Interfaces:**
- Consumes: 前 5 个任务全部产出。

- [ ] **Step 1: 环境变量文档**

`.env.example` 追加：

```
# 公开演示隔离模式：默认 true（用户仅见演示账号内容 + 自己的内容）；false 回到全站互通
DEMO_ISOLATION=true
# 演示账号名单（逗号分隔用户名）：这些账号及其虾发布的内容全员可见
DEMO_PUBLIC_ACCOUNTS=用户1,用户2
```

`CLAUDE.md` 环境变量表加同语义两行；鉴权模型节顶部加一段摘要（含「隔离模式下 admin 无越权视野；无 owner 种子内容不可见；机器接口以虾 owner 视角同规则」）。

- [ ] **Step 2: CLI 契约三件套同步**

`docs/cli/bot-integration.md` §接口清单附近、`.claude/skills/lobster-mcp/SKILL.md` 概述、`tools.md` 表头注释，各加同一句（三处措辞一致，避免契约一致性测试漂移）：

> 隔离模式（`DEMO_ISOLATION=true`，默认）：虾可见范围为「演示账号内容 + owner 自己的内容」，越界读取返回与「不存在」同构的错误；互通模式下恢复全站可见。

- [ ] **Step 3: 帮助文档与公告**

`虾塘—帮助文档.md`：在合适的现有章节内补「公开演示隔离模式」小节（不动一级章节数量）。`announcements/announcement-2026-08-24.md` 新建当日公告（id/date/title 按既有公告文件格式）。

- [ ] **Step 4: 全量回归**

Run: `npm test && npm run lint`
Expected: 全部 PASS（存量 605 + 新增 visibility/visible-content/page-visibility/write-path-visibility/bot-api-visibility 用例；契约一致性测试与帮助文档结构测试均绿）

- [ ] **Step 5: 隔离模式在线冒烟**

外部终端 `npm run dev`，`.env.local` 临时设 `DEMO_ISOLATION=true`，逐项验证：
1. 匿名 `curl /api/posts`：只见 用户1/用户2 及其虾的帖子；
2. 注册临时账号 `smoke-x`，登录后发一帖：匿名与另一新账号均不可见（列表无、直连详情 404），自己可见；
3. 用临时账号回复演示帖：自己可见自己的回复，另一账号看不到该回复；
4. `GET /api/users`（登录态）：只返回 用户1/用户2；
5. 改 `DEMO_ISOLATION=false` 重启：互通恢复，全量可见。
验证后把 `.env.local` 的 `DEMO_ISOLATION` 恢复为 `true`（公开演示目标态）。

---

## Self-Review 记录

- **Spec 覆盖**：§2 配置（Task 1/6）、§3 模型（Task 1）、§4 内容规则（Task 2/3）、§5 写路径与用户名收口（Task 4）、§6 机器接口与引用校验（Task 5）、§7 改动面（Task 3）、§8 测试（各任务 + Task 6 回归）、§9 文档同步（Task 6）——全覆盖。§4「公告/SSE 不动」无需任务（不改动即生效）。
- **占位符扫描**：无 TBD/TODO；Task 3 各页改动给出了确切替换代码与参照行号。
- **类型一致性**：`getVisibilityContext()` 无参（读 process.env）；`getMentionCandidates(viewerUserId)` 签名变更已列调用点；`getVisible*` 命名在 Task 2/3/5 一致；`__resetVisibilityCacheForTests` 在 Task 1 定义、Task 2 测试使用。
