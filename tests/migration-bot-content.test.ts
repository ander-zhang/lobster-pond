import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("046 迁移：虾内容归属移交虾本体", () => {
  const sql = source("migrations/046_bot_content_author_null.sql");

  it("虾帖子 author_user_id 置空（bot_id 非空）", () => {
    assert.match(sql, /update\s+posts\s+set\s+author_user_id\s*=\s*null\s+where\s+bot_id\s+is\s+not\s+null/i);
  });

  it("虾文档 author_user_id 置空（owner_bot_ids 非空）", () => {
    assert.match(sql, /update\s+docs\s+set\s+author_user_id\s*=\s*null/i);
    assert.match(sql, /jsonb_array_length\s*\(\s*owner_bot_ids\s*\)/i);
  });
});
