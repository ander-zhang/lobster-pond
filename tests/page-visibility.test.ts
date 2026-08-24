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

// 最终审查修复（C1-C3 / I1-I5）：既有路由 / 路径的可见性接入静态断言（盲区补齐）。
test("最终修复：/posts SSR、docs/bots 列表 API 接入可见包装", () => {
  // C1：/posts 列表页 SSR（原裸 getEnrichedPosts 全量泄露）
  const postsPage = readFileSync("src/app/posts/page.tsx", "utf8");
  assert.ok(postsPage.includes("getVisibleEnrichedPosts"), "/posts 页应使用 getVisibleEnrichedPosts");

  // C2：GET /api/docs（原裸 getDocs 全量泄露，匿名可读）
  const docsApi = readFileSync("src/app/api/docs/route.ts", "utf8");
  assert.ok(docsApi.includes("getVisibleDocs"), "/api/docs GET 应使用 getVisibleDocs");

  // I1：GET /api/bots（原裸 getBots 全量泄露，匿名可读）
  const botsApi = readFileSync("src/app/api/bots/route.ts", "utf8");
  assert.ok(botsApi.includes("getVisibleBots"), "/api/bots GET 应使用 getVisibleBots");
});

test("最终修复：文档评论按评论者过滤（三条读路径传 viewer）", () => {
  // C3：getDocComments 隔离模式下经 commentVisibleTo 过滤
  const service = readFileSync("src/lib/services/doc-comment-service.ts", "utf8");
  assert.ok(service.includes("commentVisibleTo"), "getDocComments 应经 commentVisibleTo 过滤");

  const detailPage = readFileSync("src/app/library/[type]/[id]/page.tsx", "utf8");
  assert.ok(detailPage.includes("getDocComments(doc.id, doc.type, currentUser?.id ?? null)"),
    "文档详情页 initialComments 应传 currentUser viewer");

  const commentsRoute = readFileSync("src/app/api/docs/[type]/[id]/comments/route.ts", "utf8");
  assert.ok(commentsRoute.includes("getDocComments(id, type, currentUser?.id ?? null)"),
    "评论 GET 路由应传 currentUser viewer");

  const botRoute = readFileSync("src/app/api/bot/docs/comments/route.ts", "utf8");
  assert.ok(botRoute.includes("getDocComments(docId, doc.type, auth.principal.owner.id)"),
    "虾读评论路由应传 owner viewer（principal.owner.id）");
});

test("最终修复：发帖查重可见化与附件下载守卫", () => {
  // I2/I3：publishPost 内部解析虾 owner 视角，refs 过滤与标题/id 查重统一用可见集合
  const postService = readFileSync("src/lib/services/post-service.ts", "utf8");
  assert.ok(postService.includes("visiblePosts"), "publishPost 查重应使用可见帖子集合（visiblePosts）");

  // I5：回复附件下载路由按所属帖子可见性守卫
  const assetsRoute = readFileSync("src/app/api/posts/[id]/replies/assets/[assetId]/route.ts", "utf8");
  assert.ok(assetsRoute.includes("postVisibleTo"), "附件下载路由应经 postVisibleTo 守卫");
});
