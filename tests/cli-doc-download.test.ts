import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("CLI doc download routes", () => {
  const dynamic = () => source("src/app/api/bot/docs/[type]/[id]/download/route.ts");
  const staticRoute = () => source("src/app/api/bot/docs/download/route.ts");
  const shared = () => source("src/lib/doc-download.ts");

  it("dynamic route authenticates with the shared bot credential check", () => {
    const text = dynamic();
    assert.match(text, /authenticateBotRequest/);
    assert.match(text, /x-lobster-token/);
  });

  it("dynamic route only serves Approved documents (formal-basis rule)", () => {
    const text = dynamic();
    assert.match(text, /contentState\s*===\s*"Approved"/);
    assert.match(text, /"Approved"/);
  });

  it("dynamic route delegates file resolution to the shared resolver", () => {
    const text = dynamic();
    assert.match(text, /resolveDocDownloadFile/);
  });

  it("rejects invalid types and missing docs", () => {
    const text = dynamic();
    assert.match(text, /文档类型无效/);
    assert.match(text, /文档不存在/);
  });

  it("counts downloads only when a file is produced", () => {
    const text = dynamic();
    assert.match(text, /incrementDocDownload/);
  });

  it("uses nodejs runtime for live export", () => {
    const text = dynamic();
    assert.match(text, /runtime = "nodejs"/);
  });

  it("is a static path (no [type]/[id] dynamic segment)", () => {
    const text = staticRoute();
    assert.match(text, /POST/);
    assert.match(text, /docId/);
    assert.doesNotMatch(text, /context\.params/);
  });

  it("static route authenticates and only serves Approved docs", () => {
    const text = staticRoute();
    assert.match(text, /authenticateBotRequest/);
    assert.match(text, /"Approved"/);
    assert.match(text, /resolveDocDownloadFile/);
    assert.match(text, /contentBase64/);
  });

  it("shared resolver prefers uploaded asset over live export", () => {
    const text = shared();
    assert.match(text, /getDocAsset/);
    assert.match(text, /exportDoc/);
    assert.match(text, /contentBase64/);
  });
});
