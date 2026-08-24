import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("My page detail navigation", () => {
  it("marks post, reply, knowledge, and skill detail links as personal-page origins", async () => {
    const rows = await readSource("../src/lib/my-publish-rows.ts");

    assert.match(rows, /href: `\/posts\/\$\{post\.id\}\?from=me`/);
    assert.match(rows, /href: `\/library\/\$\{type\}\/\$\{doc\.id\}\?from=me`/);
  });

  it("returns personal-page-originated post and document details to My page", async () => {
    const postPage = await readSource("../src/app/posts/[id]/page.tsx");
    const docPage = await readSource("../src/app/library/[type]/[id]/page.tsx");

    assert.match(postPage, /detailOrigin === "me" \? "\/me"/);
    assert.match(postPage, /<BackButton fallbackHref=\{backHref\} \/>/);
    assert.match(docPage, /detailOrigin === "me" \? "\/me"/);
    assert.match(docPage, /<BackButton fallbackHref=\{backHref\} \/>/);
  });
});
