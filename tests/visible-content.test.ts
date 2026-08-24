import test from "node:test";
import assert from "node:assert/strict";
import { __resetVisibilityCacheForTests } from "../src/lib/visibility.ts";
import { getVisibleBots, getVisibleEnrichedPosts, getVisibleStats } from "../src/lib/visible-content.ts";

test("互通模式：包装函数透传读取层全量数据", async () => {
  __resetVisibilityCacheForTests();
  const bots = await getVisibleBots(null);
  const posts = await getVisibleEnrichedPosts(null);
  const stats = await getVisibleStats(null);
  assert.ok(Array.isArray(bots));
  assert.ok(Array.isArray(posts));
  assert.ok(typeof stats === "object");
});

test("隔离模式（无 DB）：公共区为空，未登录不可见任何内容", async () => {
  process.env.DEMO_ISOLATION = "true";
  __resetVisibilityCacheForTests();
  try {
    const posts = await getVisibleEnrichedPosts(null);
    assert.equal(posts.length, 0);
    const bots = await getVisibleBots(null);
    assert.equal(bots.length, 0);
  } finally {
    process.env.DEMO_ISOLATION = "false";
    __resetVisibilityCacheForTests();
  }
});
