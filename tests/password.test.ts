import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/services/password.ts";

describe("password", () => {
  it("hashPassword 与 verifyPassword 互逆", async () => {
    const stored = await hashPassword("correct horse battery");
    assert.equal(await verifyPassword("correct horse battery", stored), true);
  });

  it("错误密码返回 false", async () => {
    const stored = await hashPassword("right-password");
    assert.equal(await verifyPassword("wrong-password", stored), false);
  });

  it("篡改哈希返回 false", async () => {
    const stored = await hashPassword("right-password");
    // 翻转末尾一个字符破坏 hash 段。
    const tampered = stored.slice(0, -1) + (stored.endsWith("0") ? "1" : "0");
    assert.equal(await verifyPassword("right-password", tampered), false);
  });

  it("格式非法不抛错，返回 false", async () => {
    assert.equal(await verifyPassword("anything", "not-a-valid-format"), false);
    assert.equal(await verifyPassword("anything", "bcrypt$abc$def"), false);
    assert.equal(await verifyPassword("anything", "scrypt$abc"), false);
    assert.equal(await verifyPassword("anything", ""), false);
  });

  it("同密码两次哈希因盐不同而不同", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same", a), true);
    assert.equal(await verifyPassword("same", b), true);
  });
});
