import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createZip } from "../src/lib/zip.ts";
import { exportDoc, serializeKnowledgeMarkdown } from "../src/lib/doc-export.ts";
import type { MarkdownDoc } from "../src/lib/types.ts";

const knowledge: MarkdownDoc = {
  id: "incident-routing-matrix",
  title: "故障路由矩阵",
  tags: ["incident", "routing"],
  domain: "incident",
  category: "经验",
  subtype: null,
  updatedAt: "2026-06-09",
  ownerBotIds: ["relay-ops"],
  summary: "在升级之前，把重复告警映射到单一故障负责人。",
  body: "# 故障路由矩阵\n\n正文内容。",
  type: "knowledge",
  contentState: "Approved",
  version: "v1.2",


  evidence: "问题帖 pkt-2401",
  authorUserId: null,
};

const skill: MarkdownDoc = {
  id: "incident-triage",
  title: "故障分诊",
  tags: ["incident"],
  scenario: "编程开发",
  updatedAt: "2026-06-09",
  ownerBotIds: ["relay-ops"],
  summary: "在升级之前，把重复告警映射到单一故障负责人。",
  body: "# 故障分诊\n\n正文内容。",
  type: "skills",
  contentState: "Approved",
  version: "v1.2",
  evidence: "问题帖 pkt-2401",
  authorUserId: null,
};

// 解析最小 ZIP：读 EOCD，遍历本地文件头，提取文件名与 store 数据。
function parseZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files: Array<{ name: string; content: string }> = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const content = decoder.decode(bytes.slice(dataStart, dataStart + size));
    files.push({ name, content });
    offset = dataStart + size;
  }
  return files;
}

describe("doc export", () => {
  it("serializes knowledge to frontmatter + body markdown", () => {
    const md = serializeKnowledgeMarkdown(knowledge);
    assert.ok(md.startsWith("---\n"));
    assert.ok(md.includes("id: incident-routing-matrix"));
    assert.ok(md.includes("tags: [incident, routing]"));
    assert.ok(md.includes("contentState: Approved"));
    assert.ok(md.includes("version: v1.2"));
    assert.ok(md.trimEnd().endsWith("正文内容。"));
  });

  it("emits category always and subtype only when present (round-trips taxonomy)", () => {
    const standardDoc: MarkdownDoc = { ...knowledge, category: "标准", subtype: "编码标准" };
    const stdMd = serializeKnowledgeMarkdown(standardDoc);
    assert.ok(stdMd.includes("category: 标准"));
    assert.ok(stdMd.includes("subtype: 编码标准"));

    // 经验类无 subtype：只输出 category，不输出 subtype 行。
    const experienceMd = serializeKnowledgeMarkdown(knowledge);
    assert.ok(experienceMd.includes("category: 经验"));
    assert.ok(!/^subtype:/m.test(experienceMd));
  });

  it("exports knowledge as a .md file", () => {
    const result = exportDoc(knowledge);
    assert.equal(result.filename, "incident-routing-matrix.md");
    assert.equal(result.contentType, "text/markdown; charset=utf-8");
  });

  it("exports a skill as a .zip containing {id}/SKILL.md", () => {
    const result = exportDoc(skill);
    assert.equal(result.filename, "incident-triage.zip");
    assert.equal(result.contentType, "application/zip");

    const files = parseZip(result.body);
    const skillMd = files.find((file) => file.name === "incident-triage/SKILL.md");
    assert.ok(skillMd, "zip must contain incident-triage/SKILL.md");
    assert.ok(skillMd.content.includes("name: incident-triage"));
    assert.ok(skillMd.content.includes("description:"));
    assert.ok(files.some((file) => file.name === "incident-triage/README.md"));
  });

  it("produces a structurally valid zip (EOCD signature present)", () => {
    const zip = createZip([{ path: "a/b.md", content: "hello" }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // 最后 22 字节为 EOCD，签名 0x06054b50。
    assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
    assert.deepEqual(parseZip(zip), [{ name: "a/b.md", content: "hello" }]);
  });
});
