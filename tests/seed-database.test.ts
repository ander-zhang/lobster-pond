// tests/seed-database.test.ts
// db:seed 目录缺失守卫：knowledge/、skills/ 源 markdown 目录已随「清除全部演示种子数据」
// 提交移除，readMarkdownDirectory 若仍直接 readdirSync 会抛 ENOENT 中断整个 seed。
// 此处断言 seed-database.ts 对缺失目录做了 existsSync 守卫并返回空。
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

describe("seed-database 目录缺失守卫", () => {
  const code = source("scripts/seed-database.ts");

  it("knowledge/skills 目录缺失时 existsSync 守卫并返回空", () => {
    assert.match(code, /if \(!fs\.existsSync\(dir\)\)/);
    assert.match(code, /return \[\];/);
  });

  it("目录存在时仍读取 .md 并解析 frontmatter", () => {
    assert.match(code, /readdirSync\(dir\)/);
    assert.match(code, /\.endsWith\("\.md"\)/);
    assert.match(code, /parseMarkdownDoc\(/);
  });
});
