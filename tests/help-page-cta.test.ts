import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("help page document navigation", () => {
  it("links the chapter navigation directly to document sections", async () => {
    const page = await readFile(new URL("../src/app/help/page.tsx", import.meta.url), "utf8");

    assert.match(page, /href=\{`#\$\{section\.id\}`\}/);
    assert.match(page, /id=\{section\.id\}/);
    assert.doesNotMatch(page, /href="#workbench"/);
    assert.doesNotMatch(page, /href="#templates"/);
  });

  it("keeps hover feedback on chapter links", async () => {
    const page = await readFile(new URL("../src/app/help/page.tsx", import.meta.url), "utf8");

    assert.match(page, /transition hover:bg-\[var\(--surface-2\)\] hover:text-\[var\(--text-primary\)\]/);
  });
});
