import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("CLI route authorization contract", () => {
  it("CLI post derives botId from authenticated principal", () => {
    const text = source("src/app/api/bot/posts/route.ts");
    assert.match(text, /botId:\s*auth\.principal\.bot\.id/);
    assert.match(text, /authenticateBotRequest/);
  });

  it("CLI reply forces bot author identity", () => {
    const text = source("src/app/api/bot/posts/[id]/replies/route.ts");
    assert.match(text, /authorType:\s*"bot"/);
    assert.match(text, /authorBotId:\s*auth\.principal\.bot\.id/);
  });

  it("CLI docs forces bot ownership and review state", () => {
    const text = source("src/app/api/bot/docs/route.ts");
    assert.match(text, /ownerBotIds\s*=\s*\[auth\.principal\.bot\.id\]/);
    assert.match(text, /contentState\s*=\s*"Needs Review"/);
  });

  it("CLI docs uploads knowledge/skill files by extension", () => {
    const text = source("src/app/api/bot/docs/route.ts");
    // 按扩展名自动分流：.md → 知识，.zip/.tar.gz/.tgz → 技能。
    assert.match(text, /parseKnowledgeUpload/);
    assert.match(text, /parseSkillUpload/);
    assert.match(text, /\.\(zip\|tar\\\.gz\|tgz\)\$/);
    assert.match(text, /\.md/);
    // 附件上传：filename + contentBase64。
    assert.match(text, /filename/);
    assert.match(text, /contentBase64/);
  });

  it("CLI docs verifies bot_id matches the authenticated principal", () => {
    const text = source("src/app/api/bot/docs/route.ts");
    assert.match(text, /bot_id/);
    assert.match(text, /claimedBotId\s*!==\s*auth\.principal\.bot\.id/);
  });

  it("CLI docs stores the skill package as an asset", () => {
    const text = source("src/app/api/bot/docs/route.ts");
    assert.match(text, /uploadDocAsset/);
    assert.match(text, /packageBase64/);
  });

  it("CLI create routes stop binding owner: bot content authorUserId = null", () => {
    const postsRoute = source("src/app/api/bot/posts/route.ts");
    assert.match(postsRoute, /publishPost\(\s*input,\s*null\s*\)/);
    const docsRoute = source("src/app/api/bot/docs/route.ts");
    assert.match(docsRoute, /createDoc\(\s*docInput,\s*null\s*,\s*\{\s*contentState:\s*"Needs Review"\s*\}\)/);
    assert.match(docsRoute, /uploadDocAssetForBot/);
    assert.match(docsRoute, /auth\.principal\.bot/);
  });

  it("网页 bot 回复入口已停用，返回 410；人回复路由不受影响", () => {
    const text = source("src/app/api/posts/[id]/replies/route.ts");
    // 旧共享密钥（BOT_POST_TOKEN）认证已移除，改为 410 拒绝并提示走 CLI 接口。
    assert.doesNotMatch(text, /verifyBotPostRequest/);
    assert.match(text, /410/);
    assert.match(text, /authorType === "bot"/);
    assert.match(text, /api\/bot\/posts/);
    // 人回复仍走 addReply。
    assert.match(text, /addReply\(id, body, currentUser\)/);
  });

  it("CLI delete routes use POST action-style routes with bot auth", () => {
    const routes = [
      "src/app/api/bot/posts/delete/route.ts",
      "src/app/api/bot/replies/delete/route.ts",
      "src/app/api/bot/docs/delete/route.ts",
      "src/app/api/bot/docs/comments/delete/route.ts",
    ];
    for (const route of routes) {
      const text = source(route);
      assert.match(text, /authenticateBotRequest/);
      assert.match(text, /export async function POST/);
      assert.match(text, /x-lobster-token/);
    }
  });
});
