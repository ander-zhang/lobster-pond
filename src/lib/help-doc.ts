import { readFile } from "node:fs/promises";
import path from "node:path";

const HELP_DOC_SOURCE = "虾塘—帮助文档.md";

export type HelpDoc = {
  title: string;
  body: string;
  source: string;
  characterCount: number;
  sections: HelpDocSection[];
};

export type HelpDocSection = {
  id: string;
  title: string;
  body: string;
};

export async function getHelpDoc(): Promise<HelpDoc> {
  const filePath = path.join(process.cwd(), HELP_DOC_SOURCE);
  const content = (await readFile(filePath, "utf8")).replace(/\r\n/g, "\n").trim();
  const [title, ...bodyLines] = content.split("\n");
  const body = bodyLines.join("\n").trim();

  return {
    title: title.trim(),
    body,
    source: HELP_DOC_SOURCE,
    // 全文字数按 Unicode 字符统计，忽略 Markdown 排版产生的空格、缩进与换行。
    characterCount: Array.from(`${title.trim()}${body}`.replace(/\s/gu, "")).length,
    sections: parseHelpDocSections(body),
  };
}

export function parseHelpDocSections(body: string): HelpDocSection[] {
  const lines = body.split("\n");
  const sections: Array<{ id: string; title: string; lines: string[] }> = [];
  let current: { id: string; title: string; lines: string[] } | null = null;
  // 围栏代码块（``` / ~~~）内的 `---` 是 YAML 等内容，不是 Setext 标题下划线。
  // 不跟踪围栏会把帮助文档里的 frontmatter 示例误判为新一级标题。
  let inFence = false;
  let fenceChar = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const ch = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      if (current) {
        current.lines.push(line);
      }
      continue;
    }

    if (inFence) {
      if (current) {
        current.lines.push(line);
      }
      continue;
    }

    const nextUnderline = nextNonEmptyLine(lines, index + 1);

    if (trimmed && /^-+$/.test(nextUnderline.line)) {
      if (current) {
        sections.push(current);
      }
      current = { id: sectionId(trimmed), title: trimmed, lines: [] };
      index = nextUnderline.index;
      continue;
    }

    if (/^=+$/.test(trimmed) || /^-+$/.test(trimmed)) {
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    body: section.lines.join("\n").trim(),
  }));
}

function nextNonEmptyLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line) {
      return { index, line };
    }
  }

  return { index: startIndex, line: "" };
}

function sectionId(title: string) {
  const sectionNumber = title.match(/^(\d+)\./)?.[1];

  if (sectionNumber) {
    return `section-${sectionNumber}`;
  }

  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
