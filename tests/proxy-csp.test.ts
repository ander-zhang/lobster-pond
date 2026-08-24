import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("page CSP", () => {
  it("does not upgrade LAN HTTP requests during development", async () => {
    const source = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");

    assert.match(source, /\.\.\.\(isDev \? \[\] : \["upgrade-insecure-requests"\]\)/);
    assert.doesNotMatch(source, /^\s*"upgrade-insecure-requests",$/m);
  });
});
