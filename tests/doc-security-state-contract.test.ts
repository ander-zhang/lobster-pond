import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("document security and state-machine contract", () => {
  it("用户网页发布直接批准，CLI 发布仍进入待审核", () => {
    assert.match(source("src/app/api/docs/route.ts"), /contentState: "Approved"/);
    const upload = source("src/app/api/docs/upload/route.ts");
    assert.equal((upload.match(/contentState = "Approved"/g) ?? []).length, 2);
    assert.match(source("src/app/api/bot/docs/route.ts"), /contentState: "Needs Review"/);
  });

  it("Web 发布不信任 frontmatter ownerBotIds：恒置空（与 CLI 强制 [当前虾] 对称，堵人发文档混入虾 mine 列表）", () => {
    // 文件上传：知识 / 技能两分支各强制 docInput.ownerBotIds = []。
    const upload = source("src/app/api/docs/upload/route.ts");
    assert.equal((upload.match(/docInput\.ownerBotIds = \[\]/g) ?? []).length, 2);
    // 旧 JSON 路由同样不信任请求体 ownerBotIds。
    assert.match(source("src/app/api/docs/route.ts"), /ownerBotIds:\s*\[\]/);
    // 对照：CLI 发布仍强制 [当前虾]（不置空，虾本人发布）。
    assert.match(source("src/app/api/bot/docs/route.ts"), /ownerBotIds = \[auth\.principal\.bot\.id\]/);
  });

  it("网页上传知识收集种别/类型：前端弹窗必选、路由表单覆盖、确认按钮校验", () => {
    const upload = source("src/app/api/docs/upload/route.ts");
    // 路由读取表单 category / subtype 并覆盖解析结果（仅知识分支）。
    assert.match(upload, /form\.get\("category"\)/);
    assert.match(upload, /docInput\.category = formCategory/);
    assert.match(upload, /form\.get\("subtype"\)/);
    // 前端弹窗：知识显示种别下拉与级联类型下拉，确认按钮在知识缺种别 / 缺类型时禁用。
    const button = source("src/components/DocUploadButton.tsx");
    assert.match(button, /setCategory/);
    assert.match(button, /label="种别"/);
    assert.match(button, /label="类型"/);
    assert.match(button, /isKnowledge && !category\)/);
    assert.match(button, /isKnowledge && needsSubtype && !subtype/);
  });

  it("asset service authorizes before writing and binds deletion to type", () => {
    const asset = source("src/lib/services/asset-service.ts");
    assert.match(asset, /canUpdateDoc\(currentUser, doc\.authorUserId\)/);
    assert.match(asset, /deleteDocAssetRow\(docId, type\)/);
    const route = source("src/app/api/docs/[type]/[id]/asset/route.ts");
    assert.match(route, /uploadDocAsset\([\s\S]*currentUser\)/);
    assert.match(route, /removeDocAsset\(type, id, currentUser\)/);
  });

  it("review and reject bind the URL type and atomically require Needs Review", () => {
    assert.match(source("src/app/api/docs/[type]/[id]/review/route.ts"), /reviewDoc\(type, id, currentUser\)/);
    assert.match(source("src/app/api/docs/[type]/[id]/reject/route.ts"), /rejectDoc\(type, id, body, currentUser\)/);
    const mutations = source("src/lib/content-mutations.ts");
    assert.match(mutations, /where id = \$\{id\} and content_state = \$\{expectedState\}/);
    assert.match(mutations, /where id = \$\{id\} and content_state = \$\{expectedState\}/);
  });

  it("reject notifies every publishing bot without relying on @ text", () => {
    const button = source("src/components/DocRejectButton.tsx");
    assert.doesNotMatch(button, /publisherNames|map\(\(name\) => `@/);
    assert.match(button, /发布该.*将自动收到驳回消息/);

    const service = source("src/lib/services/doc-service.ts");
    assert.match(service, /for \(const botId of doc\.ownerBotIds\)/);
    assert.match(service, /insertBotDocRejectionNotification\(\{/);
    assert.match(service, /message: rejectionReason/);
    assert.match(service, /select pg_notify/);
  });

  it("all rerun migrations accept later document states", () => {
    for (const migration of [
      "migrations/020_simplify_content_state.sql",
      "migrations/023_simplify_content_state_two_states.sql",
      "migrations/028_rejection_review_state.sql",
    ]) {
      const sql = source(migration);
      assert.match(sql, /'Needs Attention'/);
      assert.match(sql, /'Reviewing'/);
    }
  });
});
