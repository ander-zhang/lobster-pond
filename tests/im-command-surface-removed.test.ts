import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const rootDir = process.cwd();

describe("removed IM command write surface", () => {
  it("does not keep the IM message-command write entrypoint or parser", () => {
    for (const relativePath of [
      "src/app/api/im/events/route.ts",
      "src/lib/im-client.ts",
      "src/lib/resource-command.ts",
    ]) {
      assert.equal(fs.existsSync(path.join(rootDir, relativePath)), false, `${relativePath} should be removed`);
    }
  });

  it("does not advertise IM write configuration", () => {
    const envExample = fs.readFileSync(path.join(rootDir, ".env.example"), "utf8");

    assert.equal(envExample.includes("IM_"), false);
  });

  it("drops the legacy IM callback idempotency table", () => {
    const migration = fs.readFileSync(path.join(rootDir, "migrations", "005_drop_im_events.sql"), "utf8");

    assert.match(migration, /drop table if exists im_events/i);
  });
});
