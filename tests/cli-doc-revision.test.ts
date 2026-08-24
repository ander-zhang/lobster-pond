// tests/cli-doc-revision.test.ts
// 虾通过 CLI 复盘被驳回文档的闭环：读取驳回理由（通知 + 详情）、覆盖复盘中的文档。
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { nextDocStateAfterUpdate } from "../src/lib/services/doc-service.ts";
import { toDocListItem, toDocDetailItem } from "../src/lib/cli-read-mappers.ts";
import type { Bot, MarkdownDoc } from "../src/lib/types.ts";

const root = new URL("../", import.meta.url);
function source(path: string) { return fs.readFileSync(new URL(path, root), "utf8"); }

const bot: Bot = { id: "bot-a", name: "虾A", role: "个人虾", master: "", ownerUserId: "u1", summary: "", domains: [], version: "v1", model: "deepseek", createdAt: null };

function doc(overrides: Partial<MarkdownDoc> = {}): MarkdownDoc {
  return {
    id: "d1", title: "知识", tags: ["t"], domain: "incident", category: "经验", subtype: null, updatedAt: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z", ownerBotIds: ["bot-a"], summary: "摘要", body: "正文",
    type: "knowledge", contentState: "Reviewing", version: "v1",
evidence: null, authorUserId: null,
    rejectedAt: "2026-08-02T00:00:00.000Z", rejector: "alice", rejectionReason: "证据不足",
    ...overrides,
  } as MarkdownDoc;
}

const botsById = new Map([[bot.id, bot] as const]);
const authorNames = new Map<string, string>();

describe("虾修订文档的状态分流", () => {
  it("Reviewing / Needs Attention → Needs Review（需 owner 重新审批）", () => {
    assert.equal(nextDocStateAfterUpdate("Reviewing"), "Needs Review");
    assert.equal(nextDocStateAfterUpdate("Needs Attention"), "Needs Review");
  });

  it("Approved → Approved（修订直接发布）", () => {
    assert.equal(nextDocStateAfterUpdate("Approved"), "Approved");
  });
});

describe("CLI 读取被驳回文档详情", () => {
  it("toDocListItem 透传真实 contentState（不再写死 Approved）", () => {
    const item = toDocListItem(doc(), botsById, authorNames);
    assert.equal(item.contentState, "Reviewing");
  });

  it("toDocDetailItem 带驳回审计字段（理由 / 驳回者 / 时间）", () => {
    const item = toDocDetailItem(doc(), botsById, authorNames);
    assert.equal(item.rejectionReason, "证据不足");
    assert.equal(item.rejector, "alice");
    assert.equal(item.rejectedAt, "2026-08-02T08:00:00.000+08:00");
  });

  it("toDocDetailItem 无驳回记录时为 null", () => {
    const item = toDocDetailItem(doc({ rejectedAt: null, rejector: null, rejectionReason: null }), botsById, authorNames);
    assert.equal(item.rejectionReason, null);
    assert.equal(item.rejector, null);
    assert.equal(item.rejectedAt, null);
  });
});

describe("CLI 复盘闭环接口", () => {
  it("detail 路由：owner 虾可读自己未批准文档，他人仍 422", () => {
    const route = source("src/app/api/bot/docs/detail/route.ts");
    assert.match(route, /const isOwnerBot = doc\.ownerBotIds\.includes\(auth\.principal\.bot\.id\)/);
    assert.match(route, /doc\.contentState !== "Approved" && !isOwnerBot/);
  });

  it("list 路由：mine=true 仅返回该虾本人发布的文档（含未批准、排除人发文档），缺省仅 Approved", () => {
    const route = source("src/app/api/bot/docs/list/route.ts");
    assert.match(route, /mine = parseCliBooleanFlag\(body\?\.mine\)/);
    // mine 走 isMineDoc（ownerBotIds 含本虾 且 authorUserId 为空）：只认虾 CLI 本人发布，
    // 排除 Web 用户发布——后者即便 frontmatter 带 ownerBotIds 也不混入（堵泄露）。
    assert.match(route, /mine\s*\?\s*docs\.filter\(\(doc\) => isMineDoc\(doc, auth\.principal\.bot\.id\)\)\s*:\s*docs\.filter\(\(doc\) => doc\.contentState === "Approved"\)/);
  });

  it("评论路由：owner 虾可读自己未批准文档的评论（供判断如何修订）", () => {
    const route = source("src/app/api/bot/docs/comments/route.ts");
    assert.match(route, /const isOwnerBot = doc\.ownerBotIds\.includes\(auth\.principal\.bot\.id\)/);
    assert.match(route, /doc\.contentState !== "Approved" && !isOwnerBot/);
  });

  it("更新接口：动态与静态路由均存在，授权按 bot ∈ ownerBotIds", () => {
    const dynamic = source("src/app/api/bot/docs/[type]/[id]/update/route.ts");
    const staticRoute = source("src/app/api/bot/docs/update/route.ts");
    assert.match(dynamic, /performCliDocUpdate/);
    assert.match(staticRoute, /performCliDocUpdate/);
    const service = source("src/lib/services/doc-service.ts");
    assert.match(service, /updateDocFromBotUpload/);
    assert.match(service, /existing\.ownerBotIds\.includes\(bot\.id\)/);
  });

  it("虾修订发布者不变：ownerBotIds 沿用原文档（不强制单虾）", () => {
    const service = source("src/lib/services/doc-service.ts");
    const botUpdate = service.slice(service.indexOf("updateDocFromBotUpload"), service.indexOf("export function canUpdateDoc"));
    assert.match(botUpdate, /ownerBotIds: existing\.ownerBotIds/);
    assert.doesNotMatch(botUpdate, /ownerBotIds: \[bot\.id\]/);
  });

  it("update_doc handler 不强制归属当前虾，交接给 updateDocFromBotUpload 保留原归属", () => {
    const handler = source("src/lib/cli-doc-update.ts");
    // 不再写 docInput.ownerBotIds = [bot.id]，由服务层保留原文档归属。
    assert.doesNotMatch(handler, /docInput\.ownerBotIds = \[bot\.id\]/);
    assert.match(handler, /发布者不变：ownerBotIds 由 updateDocFromBotUpload 保留原文档归属/);
    assert.match(handler, /updateDocFromBotUpload\(type, id, \{ docInput, asset \}, bot\)/);
  });

  it("驳回通知携带驳回者（服务写入 + 迁移列 + 读取映射）", () => {
    const service = source("src/lib/services/bot-notification-service.ts");
    assert.match(service, /rejector: string;/);
    assert.match(service, /values \(.*input\.rejector/);
    assert.match(service, /rejector = excluded\.rejector/);
    const docService = source("src/lib/services/doc-service.ts");
    assert.match(docService, /rejector: rejector,/);
    const migration = source("migrations/043_doc_rejection_rejector.sql");
    assert.match(migration, /add column if not exists rejector text/);
  });

  it("虾上传的文档被评论：通知虾本身（doc_comment），owner 不通知", () => {
    const service = source("src/lib/services/doc-comment-service.ts");
    // 评论后给文档 owner 虾写 doc_comment 通知，排除评论者本人是虾。
    assert.match(service, /insertBotDocCommentNotification/);
    assert.match(service, /ownerBotIds\.filter\(\(botId\) => botId !== actorBotId\)/);
    // owner（人）仅在 Web 用户发布（无 ownerBotIds）的文档时收到网页通知。
    assert.match(service, /ownerBotIds\.length === 0 \? docCommentNotificationRecipient/);
    const notifService = source("src/lib/services/bot-notification-service.ts");
    assert.match(notifService, /kind: "doc_comment"/);
    assert.match(notifService, /'doc_comment'/);
    const migration = source("migrations/044_doc_comment_notifications.sql");
    assert.match(migration, /'doc_rejected', 'reply', 'mention', 'doc_comment'/);
    assert.match(migration, /bot_notifications_doc_comment_key/);
  });
});
