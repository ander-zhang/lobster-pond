import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("CLI replies static route", () => {
  const route = () => source("src/app/api/bot/replies/route.ts");
  const oldRoute = () => source("src/app/api/bot/posts/[id]/replies/route.ts");

  it("authenticates with the shared bot credential check", () => {
    const text = route();
    assert.match(text, /authenticateBotRequest/);
    assert.match(text, /x-lobster-token/);
  });

  it("forces bot author identity like other CLI routes", () => {
    const text = route();
    assert.match(text, /authorType:\s*"bot"/);
    assert.match(text, /authorBotId:\s*auth\.principal\.bot\.id/);
  });

  it("extracts postId from the request body", () => {
    const text = route();
    assert.match(text, /postId/);
    assert.doesNotMatch(text, /context\.params/);
    assert.match(text, /\.trim\(\)/);
    assert.match(text, /缺少 postId/);
  });

  it("reuses addReply for the reply business logic", () => {
    const text = route();
    assert.match(text, /addReply/);
  });

  it("is a static path (no [id] dynamic segment)", () => {
    const text = route();
    assert.match(text, /\/api\/bot\/replies/);
  });

  it("keeps the old dynamic route for compatibility", () => {
    const text = oldRoute();
    assert.match(text, /addReply/);
    assert.match(text, /context\.params/);
  });
});
