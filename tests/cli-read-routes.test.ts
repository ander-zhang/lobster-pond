// tests/cli-read-routes.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(rel: string): Promise<string> {
  return readFile(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("CLI 只读路由契约", () => {
  const routes = [
    "src/app/api/bot/posts/list/route.ts",
    "src/app/api/bot/posts/detail/route.ts",
    "src/app/api/bot/docs/list/route.ts",
    "src/app/api/bot/docs/detail/route.ts",
    "src/app/api/bot/docs/comments/route.ts",
    "src/app/api/bot/announcements/route.ts",
  ];

  for (const file of routes) {
    it(`${file} 走 bot 鉴权且用 POST`, async () => {
      const text = await source(file);
      assert.match(text, /export async function POST/);
      assert.match(text, /authenticateBotRequest/);
      assert.match(text, /if \(!auth\.ok\) return NextResponse\.json/);
    });
  }

  it("list_posts 返回裁剪列表（不含完整体）", async () => {
    const text = await source("src/app/api/bot/posts/list/route.ts");
    assert.match(text, /toPostListItem/);
    assert.match(text, /posts:/);
  });

  it("list_announcements 返回仓库内全部公告（不做近一个月过滤）", async () => {
    const text = await source("src/app/api/bot/announcements/route.ts");
    // 与 Web 弹窗的 GET /api/announcements（近一个月窗口）区分：虾读全量。
    assert.match(text, /getAnnouncements\(\)/);
    assert.doesNotMatch(text, /filterAnnouncementsWithinLastMonth/);
    assert.match(text, /announcements \}/);
  });

  it("get_post_detail 404 帖子不存在", async () => {
    const text = await source("src/app/api/bot/posts/detail/route.ts");
    assert.match(text, /status: 404/);
    assert.match(text, /缺少 postId/);
  });

  it("list_docs 仅 Approved", async () => {
    const text = await source("src/app/api/bot/docs/list/route.ts");
    assert.match(text, /contentState === "Approved"/);
  });

  it("list_docs 的 mine 与 notifications 的 unread 共用 parseCliBooleanFlag（true / 1 / \"true\" / \"1\"）", async () => {
    const docs = await source("src/app/api/bot/docs/list/route.ts");
    assert.match(docs, /mine = parseCliBooleanFlag\(body\?\.mine\)/);
    const notifications = await source("src/app/api/bot/notifications/route.ts");
    assert.match(notifications, /unreadOnly = parseCliBooleanFlag\(body\?\.unread\)/);
  });

  it("list_docs 解析 Web 用户署名（fetchUsernames）", async () => {
    const text = await source("src/app/api/bot/docs/list/route.ts");
    assert.match(text, /fetchUsernames/);
  });

  it("get_doc_detail 非 Approved → 422", async () => {
    const text = await source("src/app/api/bot/docs/detail/route.ts");
    assert.match(text, /contentState !== "Approved"/);
    assert.match(text, /status: 422/);
  });

  it("get_doc_detail 解析 Web 用户署名（fetchUsernames）", async () => {
    const text = await source("src/app/api/bot/docs/detail/route.ts");
    assert.match(text, /fetchUsernames/);
  });

  it("list_doc_comments 校验文档 Approved，但 owner 虾可读自己未批准文档的评论", async () => {
    const text = await source("src/app/api/bot/docs/comments/route.ts");
    assert.match(text, /contentState !== "Approved"/);
    assert.match(text, /isOwnerBot = doc\.ownerBotIds\.includes\(auth\.principal\.bot\.id\)/);
    assert.match(text, /getDocComments/);
  });

  it("通知读取/确认走静态路由：身份由 token 反查，不再要求 botId 路径参数", async () => {
    const list = await source("src/app/api/bot/notifications/route.ts");
    assert.match(list, /export async function POST/);
    assert.match(list, /authenticateBotRequest/);
    assert.match(list, /listBotNotifications\(auth\.principal\.bot\.id/);
    // 静态路由：无动态路径参数（context.params），不从请求体/路径取 botId。
    assert.doesNotMatch(list, /context\.params|params: Promise/);

    const read = await source("src/app/api/bot/notifications/read/route.ts");
    assert.match(read, /export async function POST/);
    assert.match(read, /markBotNotificationRead\(auth\.principal\.bot\.id/);
    assert.match(read, /notificationId/);
    assert.doesNotMatch(read, /context\.params|params: Promise/);
  });
});
