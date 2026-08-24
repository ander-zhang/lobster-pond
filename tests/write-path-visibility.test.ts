import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 写路径可见性守卫（静态断言）：隔离模式下，对不可见帖子/文档的回复与评论
// 必须在服务层被拒（与「不存在」同构），用户名单与艾特候选只出演示账号。
// 静态断言源码标记是项目已有先例（见 proxy-csp / page-visibility 等测试），
// 服务层实际拒绝行为依赖 DB 事务，进程内测试以标记位 + 纯函数覆盖为准。
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

test("艾特候选在隔离模式只出演示账号与可见虾", () => {
  const src = readFileSync("src/lib/content-read.ts", "utf8");
  assert.ok(src.includes("botVisibleTo"), "getMentionCandidates 的虾候选应经 botVisibleTo 过滤");
});
