import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { getHelpDoc } from "../src/lib/help-doc.ts";

describe("CLI help documentation", () => {
  it("includes CLI integration instructions in the help document", async () => {
    const doc = await getHelpDoc();
    const cliSection = doc.sections.find((section) => section.title.startsWith("20."));
    assert.ok(cliSection, "help doc should have a section 20 for CLI integration");
    assert.match(cliSection.body, /POST \/api\/bot\/posts/);
    assert.match(cliSection.body, /LOBSTER_BOT_TOKEN/);
    assert.match(cliSection.body, /Needs Review/);
  });

  it("documents every CLI write route and the legacy compatibility boundary", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    assert.match(guide, /POST \/api\/bot\/posts/);
    assert.match(guide, /POST \/api\/bot\/posts\/\{postId\}\/replies/);
    assert.match(guide, /POST \/api\/bot\/docs/);
    assert.match(guide, /BOT_POST_TOKEN/);
    assert.match(guide, /Needs Review/);
  });

  it("documents MCP as the primary shrimp access, not clawauth-cli-call", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    // 描述式配置注册（mcpServers JSON）仍是主要/推荐方式。
    assert.match(guide, /"lobster-pond"\s*:/);
    assert.match(guide, /mcpServers/);
    assert.match(guide, /mcp\/lobster-pond/);
    assert.match(guide, /X-Lobster-Token/);
    // mcporter config add 现为 MCP 管理后台提供的虾专用备选配置（允许出现），
    // 但不得被描述为唯一 / 推荐 / 主要接入方式。
    assert.doesNotMatch(guide, /mcporter config add[^。\n]*(推荐|主要|唯一)/);
    assert.doesNotMatch(guide, /clawauth-cli-call[^。\n]*(?<!不再|已|仅|历史|回退|废弃)(现行|推荐|正式|主要)/i);
  });

  it("documents the download_doc MCP tool and Approved-only semantics", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    assert.match(guide, /download_doc/);
    assert.match(guide, /GET \/api\/bot\/docs\/\{type\}\/\{id\}\/download/);
    assert.match(guide, /Approved/);

    const doc = await getHelpDoc();
    const cliSection = doc.sections.find((section) => section.title.startsWith("20."));
    assert.ok(cliSection);
    assert.match(cliSection.body, /download_doc/);
  });

  it("documents create_doc file upload (filename + contentBase64 + bot_id)", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    assert.match(guide, /filename/);
    assert.match(guide, /contentBase64/);
    assert.match(guide, /bot_id/);
    // 按扩展名分流：.md → 知识；.zip / .tar.gz → 技能。
    assert.match(guide, /\.md/);
    assert.match(guide, /\.zip/);

    const doc = await getHelpDoc();
    const cliSection = doc.sections.find((section) => section.title.startsWith("20."));
    assert.ok(cliSection);
    assert.match(cliSection.body, /contentBase64/);
  });

  it("documents download_doc static route as primary", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    // 静态路由为主（POST /api/bot/docs/download，type/docId 进 body）。
    assert.match(guide, /POST \/api\/bot\/docs\/download/);
    // 动态 GET 保留为兼容备选。
    assert.match(guide, /GET \/api\/bot\/docs\/\{type\}\/\{id\}\/download/);

    const doc = await getHelpDoc();
    const cliSection = doc.sections.find((section) => section.title.startsWith("20."));
    assert.ok(cliSection);
    assert.match(cliSection.body, /\/api\/bot\/docs\/download/);
  });

  it("documents create_reply's dynamic URL as primary with static route as compat fallback", async () => {
    const guide = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    // 动态 URL 为主（create_reply 走 POST /api/bot/posts/{postId}/replies）
    assert.match(guide, /POST \/api\/bot\/posts\/\{postId\}\/replies/);
    // MCP hub 路径参数配置要点（参数值填 postId）
    assert.match(guide, /postId/);
    // 静态路由 POST /api/bot/replies 保留为兼容备选
    assert.match(guide, /POST \/api\/bot\/replies/);

    const doc = await getHelpDoc();
    const cliSection = doc.sections.find((section) => section.title.startsWith("20."));
    assert.ok(cliSection);
    assert.match(cliSection.body, /\/api\/bot\/replies/);
  });
});
