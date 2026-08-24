import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("help page", () => {
  it("renders only the help document reader", async () => {
    const page = await readSource("../src/app/help/page.tsx");

    assert.match(page, /getHelpDoc/);
    assert.match(page, /文档章节/);
    assert.match(page, /HelpSection/);
    assert.match(page, /文档信息/);
    assert.match(page, /来源/);
    assert.match(page, /字数/);
    assert.match(page, /doc\.characterCount\.toLocaleString/);
    assert.match(page, /关键章节/);
    assert.match(page, /KEY_SECTION_IDS/);
    assert.match(page, /"section-6", "section-7", "section-8"/);
    assert.doesNotMatch(page, /"section-5"/);
    assert.match(page, /href={`#\$\{section\.id\}`}/);
    assert.match(page, /const fence = trimmed\.match/);
    assert.match(page, /<CodeBlock code=/);
    assert.match(page, /whitespace-nowrap border-b border-\[var\(--hairline\)\].*text-\[var\(--accent-strong\)\]/);
    assert.match(page, /YAML 配置示例/);
    assert.match(page, /Markdown 正文模板/);
    assert.match(page, /bg-\[var\(--surface-2\)\]/);
    assert.doesNotMatch(page, /bg-\[var\(--surface-code\)\]/);
    assert.doesNotMatch(page, /text-\[#e5e7e7\]/);
    assert.match(page, /<code className="mono whitespace-pre">/);
    assert.match(page, /group-hover:text-\[var\(--accent-strong\)\]/);
    assert.doesNotMatch(page, /<a\s+className="[^"]*hover:text-\[var\(--accent-strong\)\]/);
    assert.doesNotMatch(page, />章节</);
    assert.doesNotMatch(page, /个一级标题/);
    assert.doesNotMatch(page, /getHelpWorkbench/);
    assert.doesNotMatch(page, /HelpOperationsPanel/);
    assert.doesNotMatch(page, /模板工坊/);
    assert.doesNotMatch(page, /审核闸门/);
    assert.doesNotMatch(page, /RAG 检索路径/);
    assert.doesNotMatch(page, /运行指标/);
    assert.doesNotMatch(page, /推荐阅读路径/);
  });
});
