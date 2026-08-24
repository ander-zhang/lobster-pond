import type { MarkdownDoc } from "./types.ts";
import { createZip } from "./zip.ts";

// 把知识/技能文档导出为可下载文件（帮助文档：让知识可被检索、引用、执行）。
// 知识导出为 .md，技能导出为含 {id}/SKILL.md 的 .zip 安装包。

// YAML 标量转义：含特殊字符时加引号。数组渲染为 [a, b, c]。
function yamlScalar(value: string): string {
  if (value === "") {
    return '""';
  }
  if (/^[A-Za-z0-9_\-./：:，,（）()一-鿿 ]+$/.test(value) && !/^[\s]|[\s]$/.test(value)) {
    // 简单值直接输出；仍对以特殊 YAML 字符开头的值加引号。
    if (/^[#&*!|>%@`"'\[\]{},]/.test(value) || /: /.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

function yamlValue(value: string | string[] | null): string {
  if (value === null) {
    return '""';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => yamlScalar(item)).join(", ")}]`;
  }
  return yamlScalar(value);
}

// 重建知识文档的 frontmatter + 正文。字段顺序与仓库内既有 .md 保持一致，
// 并附带治理元数据（contentState/version 等）便于可追溯。
export function serializeKnowledgeMarkdown(doc: MarkdownDoc): string {
  // 仅知识变体有 domain/category/subtype；exportDoc 在 if (doc.type === "knowledge") 内调用。
  const domain = doc.type === "knowledge" ? doc.domain : "";
  const category = doc.type === "knowledge" ? doc.category : "";
  const subtype = doc.type === "knowledge" ? doc.subtype : null;
  const lines: string[] = ["---"];
  lines.push(`id: ${yamlValue(doc.id)}`);
  lines.push(`title: ${yamlValue(doc.title)}`);
  lines.push(`tags: ${yamlValue(doc.tags)}`);
  lines.push(`domain: ${yamlValue(domain)}`);
  lines.push(`category: ${yamlValue(category)}`);
  if (subtype) lines.push(`subtype: ${yamlValue(subtype)}`);
  lines.push(`updatedAt: ${yamlValue(doc.updatedAt)}`);
  lines.push(`ownerBotIds: ${yamlValue(doc.ownerBotIds)}`);
  lines.push(`summary: ${yamlValue(doc.summary)}`);
  lines.push(`contentState: ${yamlValue(doc.contentState)}`);
  if (doc.version) lines.push(`version: ${yamlValue(doc.version)}`);
  if (doc.evidence) lines.push(`evidence: ${yamlValue(doc.evidence)}`);
  lines.push("---");
  lines.push("");
  lines.push(doc.body.trim());
  lines.push("");
  return lines.join("\n");
}

// 技能包内的 SKILL.md：用 agent skill 约定的 name/description frontmatter，
// 同时保留虾塘的治理元数据，正文沿用文档正文。
function serializeSkillMd(doc: MarkdownDoc): string {
  // 仅技能变体有 scenario；exportDoc 在 else 分支（doc.type === "skills"）调用。
  const scenario = doc.type === "skills" ? doc.scenario : null;
  const lines: string[] = ["---"];
  lines.push(`name: ${yamlValue(doc.id)}`);
  lines.push(`description: ${yamlValue(doc.summary)}`);
  lines.push(`title: ${yamlValue(doc.title)}`);
  lines.push(`tags: ${yamlValue(doc.tags)}`);
  lines.push(`scenario: ${yamlValue(scenario)}`);
  lines.push(`updatedAt: ${yamlValue(doc.updatedAt)}`);
  lines.push(`ownerBotIds: ${yamlValue(doc.ownerBotIds)}`);
  lines.push(`contentState: ${yamlValue(doc.contentState)}`);
  if (doc.version) lines.push(`version: ${yamlValue(doc.version)}`);
  if (doc.evidence) lines.push(`evidence: ${yamlValue(doc.evidence)}`);
  lines.push("---");
  lines.push("");
  lines.push(doc.body.trim());
  lines.push("");
  return lines.join("\n");
}

// README 帮助安装者快速理解这个技能包。
function skillReadme(doc: MarkdownDoc): string {
  // 仅技能变体有 scenario；exportDoc 在 else 分支（doc.type === "skills"）调用。
  const scenario = doc.type === "skills" ? doc.scenario : "其他";
  return [
    `# ${doc.title}`,
    "",
    doc.summary,
    "",
    "## 安装",
    "",
    `把本压缩包解压到你的 skills 目录，得到 \`${doc.id}/SKILL.md\`。`,
    "",
    `- 状态：${doc.contentState}`,
    doc.version ? `- 版本：${doc.version}` : "",
    `- 适用场景：${scenario}`,
    doc.evidence ? `- 证据来源：${doc.evidence}` : "",
    "",
    "> 来自「虾塘」技能库。只有已批准（Approved）状态的技能建议在正式任务中调用。",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export type ExportResult = {
  filename: string;
  contentType: string;
  body: Uint8Array;
};

const encoder = new TextEncoder();

export function exportDoc(doc: MarkdownDoc): ExportResult {
  if (doc.type === "knowledge") {
    return {
      filename: `${doc.id}.md`,
      contentType: "text/markdown; charset=utf-8",
      body: encoder.encode(serializeKnowledgeMarkdown(doc)),
    };
  }

  // 技能：打包成 {id}/SKILL.md + README 的 zip 安装包。
  const zip = createZip([
    { path: `${doc.id}/SKILL.md`, content: serializeSkillMd(doc) },
    { path: `${doc.id}/README.md`, content: skillReadme(doc) },
  ]);
  return {
    filename: `${doc.id}.zip`,
    contentType: "application/zip",
    body: zip,
  };
}
