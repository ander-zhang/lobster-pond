import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBotToken } from "../src/lib/services/bot-credential-service.ts";

describe("CLI bot credential header", () => {
  it("只接受 Bearer scheme 并去除首尾空格", () => {
    assert.equal(extractBotToken("Bearer   lp_bot_abc  "), "lp_bot_abc");
    assert.equal(extractBotToken("bearer lp_bot_xyz"), "lp_bot_xyz");
  });
  it("拒绝缺失、错误 scheme 和空 token", () => {
    assert.equal(extractBotToken(null), null);
    assert.equal(extractBotToken("Basic lp_bot_abc"), null);
    assert.equal(extractBotToken("Bearer   "), null);
  });
  it("网关模式：从 X-Lobster-Token 头回退读取", () => {
    // Authorization 缺失时，从 X-Lobster-Token 回退
    assert.equal(extractBotToken(null, "lp_bot_abc"), "lp_bot_abc");
    assert.equal(extractBotToken(null, "lp_bot_abc  "), "lp_bot_abc");
    // Authorization 优先于 X-Lobster-Token
    assert.equal(extractBotToken("Bearer lp_bot_auth", "lp_bot_fallback"), "lp_bot_auth");
    // X-Lobster-Token 不以 lp_bot_ 开头时忽略
    assert.equal(extractBotToken(null, "random_token"), null);
    assert.equal(extractBotToken(null, ""), null);
  });
});
