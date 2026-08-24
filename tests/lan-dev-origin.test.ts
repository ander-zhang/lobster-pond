import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("LAN development origin", () => {
  it("automatically allows active non-loopback IPv4 addresses", async () => {
    const source = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

    assert.match(source, /networkInterfaces\(\)/);
    assert.match(source, /address\.family === "IPv4" && !address\.internal/);
    assert.match(source, /allowedDevOrigins: getLanDevOrigins\(\)/);
    assert.doesNotMatch(source, /allowedDevOrigins:\s*\[\s*"\d{1,3}(?:\.\d{1,3}){3}"\s*\]/);
  });
});
