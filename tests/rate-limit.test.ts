import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateLimit, clientIp, getRateLimitConfig } from "../src/lib/services/rate-limit.ts";

// rateLimit 的桶是模块级共享状态，故每个用例用唯一 key（含随机量）避免互相干扰。
function uniqueKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit", () => {
  it("窗口内未超限 → 放行", async () => {
    const key = uniqueKey("allow");
    for (let i = 0; i < 5; i++) {
      assert.equal((await rateLimit(key, 5)).ok, true);
    }
  });

  it("超过上限 → 拒绝并给出正秒数 retryAfter", async () => {
    const key = uniqueKey("deny");
    for (let i = 0; i < 3; i++) {
      assert.equal((await rateLimit(key, 3)).ok, true);
    }
    const blocked = await rateLimit(key, 3);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfter >= 1, "retryAfter 应为正秒数");
    }
  });

  it("不同 key 互不影响", async () => {
    const k1 = uniqueKey("k1");
    const k2 = uniqueKey("k2");
    await rateLimit(k1, 1);
    assert.equal((await rateLimit(k1, 1)).ok, false); // k1 已满
    assert.equal((await rateLimit(k2, 1)).ok, true); // k2 仍可用
  });

  it("窗口过后重置", async () => {
    const key = uniqueKey("reset");
    const windowMs = 40;
    assert.equal((await rateLimit(key, 1, windowMs)).ok, true);
    assert.equal((await rateLimit(key, 1, windowMs)).ok, false);
    await new Promise((resolve) => setTimeout(resolve, windowMs + 30));
    assert.equal((await rateLimit(key, 1, windowMs)).ok, true);
  });
});

describe("clientIp", () => {
  it("优先取 x-forwarded-for 首段", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    assert.equal(clientIp(req), "203.0.113.7");
  });

  it("无 x-forwarded-for 时回退 x-real-ip", () => {
    const req = new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.4" } });
    assert.equal(clientIp(req), "198.51.100.4");
  });

  it("无代理头 → unknown", () => {
    const req = new Request("http://localhost");
    assert.equal(clientIp(req), "unknown");
  });
});

describe("getRateLimitConfig", () => {
  it("无 env 时取默认值", () => {
    const cfg = getRateLimitConfig({});
    assert.equal(cfg.loginMax, 10);
    assert.equal(cfg.registerMax, 5);
    assert.equal(cfg.recoveryMax, 5);
    assert.equal(cfg.windowMs, 60_000);
    assert.equal(cfg.recoveryWindowMs, 900_000);
  });

  it("env 合法值覆盖默认", () => {
    const cfg = getRateLimitConfig({
      LOGIN_RATE_LIMIT_MAX: "3",
      REGISTER_RATE_LIMIT_MAX: "2",
      PASSWORD_RECOVERY_RATE_LIMIT_MAX: "4",
      RATE_LIMIT_WINDOW_MS: "5000",
      PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS: "7000",
    });
    assert.deepEqual(cfg, { loginMax: 3, registerMax: 2, recoveryMax: 4, windowMs: 5000, recoveryWindowMs: 7000 });
  });

  it("非法 / 非正值回落默认", () => {
    const cfg = getRateLimitConfig({
      LOGIN_RATE_LIMIT_MAX: "not-a-number",
      REGISTER_RATE_LIMIT_MAX: "0",
      PASSWORD_RECOVERY_RATE_LIMIT_MAX: "-1",
      RATE_LIMIT_WINDOW_MS: "-5",
      PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS: "invalid",
    });
    assert.equal(cfg.loginMax, 10);
    assert.equal(cfg.registerMax, 5);
    assert.equal(cfg.recoveryMax, 5);
    assert.equal(cfg.windowMs, 60_000);
    assert.equal(cfg.recoveryWindowMs, 900_000);
  });
});
