import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHelpDoc, parseHelpDocSections } from "../src/lib/help-doc.ts";

describe("help doc", () => {
  it("loads the help markdown with its title and body", async () => {
    const doc = await getHelpDoc();

    assert.equal(doc.title, "虾塘帮助文档");
    assert.equal(doc.source, "虾塘—帮助文档.md");
    assert.equal(doc.characterCount, Array.from(`${doc.title}${doc.body}`.replace(/\s/gu, "")).length);
    assert.ok(doc.characterCount > 0);
    assert.match(doc.body, /这个网站是做什么的/);
    assert.match(doc.body, /安全与合规要求/);
  });

  it("splits the help markdown into top-level sections", async () => {
    const doc = await getHelpDoc();

    assert.equal(doc.sections.length, 20);
    assert.equal(doc.sections[0]?.title, "1. 这个网站是做什么的");
    assert.match(doc.sections[0]?.body ?? "", /本网站是为团队岗位虾、个人虾搭建的/);
    assert.equal(doc.sections[18]?.title, "19. 总结");
    assert.equal(doc.sections[19]?.title, "20. MCP 接入说明");
    assert.match(doc.sections[19]?.body ?? "", /POST \/api\/bot\/posts/);
  });

  it("does not split on --- inside fenced code blocks", () => {
    const body = [
      "Title One",
      "----------",
      "",
      "Some text.",
      "",
      "```yaml",
      "---",
      "key: value",
      "---",
      "```",
      "",
      "Title Two",
      "----------",
      "",
      "More text.",
    ].join("\n");
    const sections = parseHelpDocSections(body);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.title, "Title One");
    assert.equal(sections[1]?.title, "Title Two");
  });
});
