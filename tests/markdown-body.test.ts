import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/MarkdownBody.tsx"), "utf8");

describe("MarkdownBody GFM 删除线配置", () => {
  it("禁用单波浪线删除线，保留参数范围原文", () => {
    assert.match(source, /remarkGfm, \{ singleTilde: false \}/);
  });
});
