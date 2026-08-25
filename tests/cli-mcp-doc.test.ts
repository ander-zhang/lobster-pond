import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("CLI-to-MCP migration doc consistency", () => {
  const files = [
    "../.claude/skills/lobster-mcp/SKILL.md",
    "../docs/cli/bot-integration.md",
    "../docs/cli/operator-guide.md",
  ];

  for (const file of files) {
    it(`${file} documents MCP as the primary shrimp access`, async () => {
      const text = await readFile(new URL(file, import.meta.url), "utf8");
      // 描述式配置注册（mcpServers JSON）仍是主要/推荐方式。
      assert.match(text, /"lobster-pond"\s*:/);
      assert.match(text, /mcpServers/);
      assert.match(text, /mcp\/lobster-pond/);
      assert.match(text, /X-Lobster-Token/);
      // mcporter CLI 注册方式已从说明文档整体移除（2026-08-25），唯一注册方式为描述式配置。
      assert.doesNotMatch(text, /mcporter/i);
      // clawauth-cli-call / clawFetch 不得被描述为现行/推荐/正式/主要接入方式；
      // "不再推荐 / 已废弃 / 历史 / 回退"等否定降级措辞除外
      assert.doesNotMatch(text, /(clawauth-cli-call|clawFetch)[^。\n]*(?<!不再|已|仅|历史|回退|废弃)(现行|推荐|正式|主要)/i);
    });
  }
});

describe("CLI 只读工具文档一致性", () => {
  const NEW_READ_TOOLS = ["list_posts", "get_post_detail", "list_docs", "get_doc_detail", "list_doc_comments", "list_announcements"];

  for (const file of ["../docs/cli/bot-integration.md", "../tools.md"]) {
    it(`${file} 包含 6 个新读取工具名`, async () => {
      const text = await readFile(new URL(file, import.meta.url), "utf8");
      for (const tool of NEW_READ_TOOLS) {
        assert.match(text, new RegExp(tool));
      }
    });
  }

  it("bot-integration.md 工具清单标注为 19 个", async () => {
    const text = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    assert.match(text, /19 个 MCP 工具/);
    assert.doesNotMatch(text, /18 个 MCP 工具/);
  });
});

describe("虾自管删除工具文档一致性", () => {
  const NEW_DELETE_TOOLS = ["delete_post", "delete_reply", "delete_doc", "delete_doc_comment"];

  it("bot-integration.md 含 4 个删除工具", async () => {
    const text = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    for (const tool of NEW_DELETE_TOOLS) {
      assert.match(text, new RegExp(tool));
    }
    // 删除路由为 POST 动作式（网关只支持 GET/POST）。
    assert.match(text, /POST \/api\/bot\/posts\/delete/);
    assert.match(text, /POST \/api\/bot\/docs\/delete/);
  });

  it("tools.md 含 4 个删除工具", async () => {
    const text = await readFile(new URL("../tools.md", import.meta.url), "utf8");
    for (const tool of NEW_DELETE_TOOLS) {
      assert.match(text, new RegExp(tool));
    }
    assert.match(text, /api\/bot\/posts\/delete/);
    assert.match(text, /api\/bot\/docs\/delete/);
    assert.match(text, /api\/bot\/replies\/delete/);
    assert.match(text, /api\/bot\/docs\/comments\/delete/);
  });
});

describe("health_check 健康检查工具文档一致性", () => {
  const files = [
    "../docs/cli/bot-integration.md",
    "../docs/cli/operator-guide.md",
    "../虾塘—帮助文档.md",
  ];

  for (const file of files) {
    it(`${file} 工具清单含健康检查且无 codex_health / codex-health 残留`, async () => {
      const text = await readFile(new URL(file, import.meta.url), "utf8");
      // 健康检查工具仍在 19 个清单中；旧工具名 codex_health 与旧路径 codex-health 均不得残留。
      assert.match(text, /健康检查/);
      assert.match(text, /health_check/);
      assert.match(text, /19 个/);
      // 旧计数必须被替换，不得残留 "12 个" / "13 个" / "14 个" / "18 个"。
      assert.doesNotMatch(text, /12 个/);
      assert.doesNotMatch(text, /13 个/);
      assert.doesNotMatch(text, /14 个/);
      assert.doesNotMatch(text, /18 个/);
      assert.doesNotMatch(text, /codex[_-]health/);
    });
  }

  it("bot-integration.md 映射 GET /api/health 且标注无需 X-Lobster-Token", async () => {
    const text = await readFile(new URL("../docs/cli/bot-integration.md", import.meta.url), "utf8");
    assert.match(text, /GET \/api\/health/);
    assert.match(text, /health_check[^。\n]*不需要[^。\n]*X-Lobster-Token/);
  });

  it("tools.md health_check 工具与 /api/health 路径就位、无 codex 残留", async () => {
    const text = await readFile(new URL("../tools.md", import.meta.url), "utf8");
    assert.match(text, /## 13\. health_check/);
    assert.match(text, /\/api\/health/);
    assert.doesNotMatch(text, /codex[_-]health/);
  });
});
