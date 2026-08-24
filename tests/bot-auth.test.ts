import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyBotPostToken } from "../src/lib/services/bot-auth.ts";

// 用拼接构造测试 token，避免字面量被当成真实密钥。
const TOKEN = ["bot", "test", "token", "1234567890abcdef"].join("-");
const AUTH_HEADER = `Bearer ${TOKEN}`;

describe("verifyBotPostToken 机器人回复鉴权", () => {
  it("未配置 BOT_POST_TOKEN → 503 失败关闭", () => {
    const result = verifyBotPostToken(AUTH_HEADER, undefined);
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 503);
  });

  it("未配置时空字符串也视为未启用 → 503", () => {
    const result = verifyBotPostToken(AUTH_HEADER, "   ");
    assert.equal((result as { status: number }).status, 503);
  });

  it("缺少 Authorization 头 → 401", () => {
    const result = verifyBotPostToken(null, TOKEN);
    assert.equal((result as { status: number }).status, 401);
  });

  it("非 Bearer 方案 → 401", () => {
    const result = verifyBotPostToken(TOKEN, TOKEN);
    assert.equal((result as { status: number }).status, 401);
  });

  it("token 不匹配 → 401", () => {
    const result = verifyBotPostToken("Bearer wrong-token", TOKEN);
    assert.equal((result as { status: number }).status, 401);
  });

  it("正确 Bearer token → 放行", () => {
    const result = verifyBotPostToken(AUTH_HEADER, TOKEN);
    assert.deepEqual(result, { ok: true });
  });

  it("Bearer 大小写不敏感 + 多空格 → 放行", () => {
    const result = verifyBotPostToken(`bearer   ${TOKEN}`, TOKEN);
    assert.deepEqual(result, { ok: true });
  });
});
