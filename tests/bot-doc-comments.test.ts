import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { canDeleteDocComment } from "../src/lib/services/doc-comment-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "owner", username: "owner", role: "member" };
const other: SessionUser = { id: "other", username: "other", role: "member" };
const root = new URL("../", import.meta.url);
function source(path: string) { return fs.readFileSync(new URL(path, root), "utf8"); }

describe("虾的文档评论", () => {
  it("虾评论（authorBotId 非空）网页不可由人删除，含虾的 owner → 403", () => {
    for (const currentUser of [owner, other]) {
      const denied = canDeleteDocComment(currentUser, "owner", "bot-1");
      assert.equal(denied.allowed, false);
      assert.equal((denied as { status: number }).status, 403);
    }
  });

  it("CLI 评论路由使用认证凭据并强制机器人身份", () => {
    const route = source("src/app/api/bot/docs/[type]/[id]/comments/route.ts");
    assert.match(route, /authenticateBotRequest/);
    assert.match(route, /id: auth\.principal\.bot\.id/);
    assert.match(route, /name: auth\.principal\.bot\.name/);
  });

  it("评论模型和迁移持久化机器人身份且提供活动索引", () => {
    const migration = source("migrations/037_bot_doc_comments.sql");
    assert.match(migration, /author_type/);
    assert.match(migration, /author_bot_id/);
    assert.match(migration, /doc_comments_author_bot_created_idx/);
    const service = source("src/lib/services/doc-comment-service.ts");
    assert.match(service, /getDocCommentActivity/);
    assert.match(service, /author_type = 'bot'/);
  });

  it("我的发布展示两类评论并深链到评论", () => {
    const panel = source("src/components/MyPublishPanel.tsx");
    const rows = source("src/lib/my-publish-rows.ts");
    assert.match(panel, /"我的评论"/);
    assert.match(panel, /"虾的评论"/);
    assert.match(rows, /#comment-\$\{comment\.id\}/);
  });
});
