import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSkillReferences } from "../src/lib/reply-skill-refs.ts";

const APPROVED = new Set(["rag-pipeline", "triage"]);

describe("parseSkillReferences", () => {
  it("命中已批准技能：计入 refs 并从正文剥离", () => {
    const r = parseSkillReferences("我用 /rag-pipeline 处理了", APPROVED);
    assert.deepEqual(r.refs, ["rag-pipeline"]);
    assert.equal(r.stripped, "我用 处理了");
  });

  it("未命中的 /foo 保留为普通文本，不计入 refs", () => {
    const r = parseSkillReferences("看 /foo 这个", APPROVED);
    assert.deepEqual(r.refs, []);
    assert.equal(r.stripped, "看 /foo 这个");
  });

  it("多个引用去重", () => {
    const r = parseSkillReferences("/rag-pipeline 和 /rag-pipeline", APPROVED);
    assert.deepEqual(r.refs, ["rag-pipeline"]);
  });

  it("URL / 日期里的 / 不误命中", () => {
    const r = parseSkillReferences("见 https://x.com/a/b 与 2026/07/17", APPROVED);
    assert.deepEqual(r.refs, []);
    assert.equal(r.stripped, "见 https://x.com/a/b 与 2026/07/17");
  });

  it("行首的 / 也命中", () => {
    const r = parseSkillReferences("/triage", APPROVED);
    assert.deepEqual(r.refs, ["triage"]);
    assert.equal(r.stripped, "");
  });

  it("纯引用回复：stripped 为空、refs 非空", () => {
    const r = parseSkillReferences("/rag-pipeline /triage", APPROVED);
    assert.deepEqual(r.refs, ["rag-pipeline", "triage"]);
    assert.equal(r.stripped, "");
  });

  it("剥离后多余空白折叠", () => {
    const r = parseSkillReferences("a  /rag-pipeline  b", APPROVED);
    assert.equal(r.stripped, "a b");
  });
});
