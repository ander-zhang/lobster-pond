// 机器接口可见性接入（Task 5）：静态断言虾 API 读路径全部走 viewer 作用域包装。
// 虾视角 = 虾 owner 的视角（authenticateBotRequest 返回的 principal.owner）。
// 用静态字符串断言而非起服务：与 page-visibility / write-path-visibility 同款做法，
// 覆盖「路由确实接上了包装」这一接线事实本身。
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

test("引用校验经可见文档集合", () => {
  const src = readFileSync("src/lib/services/post-service.ts", "utf8");
  assert.ok(src.includes("docVisibleTo"), "publishPost/addReply 的 refs 校验应先过滤可见文档");
});
