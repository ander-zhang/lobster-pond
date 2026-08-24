import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { getHelpDoc, type HelpDocSection } from "@/lib/help-doc";
// 必须每请求渲染：proxy 的 nonce CSP 要求不做构建期静态预渲染
// （预渲染 HTML 无 per-request nonce，会被 'strict-dynamic' 全拦，仅生产可见）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "帮助 / Lobster Pond",
  description: "虾塘帮助文档",
};

const KEY_SECTION_IDS = new Set(["section-3", "section-4", "section-6", "section-7", "section-8", "section-17", "section-20"]);

export default async function HelpPage() {
  const doc = await getHelpDoc();
  const keySections = doc.sections.filter((section) => KEY_SECTION_IDS.has(section.id));

  return (
    <>
      <SiteHeader />
      <main className="shell pb-16 pt-8 md:pt-10">
        <section className="rounded-xl border border-[var(--hairline)] bg-white">
          <div className="grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-10 xl:grid-cols-[230px_minmax(0,1fr)_220px] xl:px-12">
            <aside className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
                <p className="px-3 text-xs font-semibold text-[var(--text-muted)]">文档章节</p>
                <nav className="mt-3 space-y-1">
                  {doc.sections.map((section) => {
                    const { label, text } = splitSectionTitle(section.title);
                    return (
                      <a
                        className="flex gap-3 rounded-md px-3 py-2 text-sm leading-5 text-[var(--text-secondary)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                        href={`#${section.id}`}
                        key={section.id}
                      >
                        <span className="mono mt-0.5 w-5 shrink-0 text-xs text-[var(--accent-strong)]">{label}</span>
                        <span>{text}</span>
                      </a>
                    );
                  })}
                </nav>
              </div>
            </aside>

            <article className="min-w-0">
              <div className="rounded-xl border border-[var(--hairline)] bg-white px-5 py-2 md:px-8">
                {doc.sections.map((section) => (
                  <HelpSection section={section} key={section.id} />
                ))}
              </div>
            </article>

            <aside className="hidden xl:block">
              <section className="sticky top-24 rounded-xl border border-[var(--hairline)] bg-[linear-gradient(145deg,#ffffff_0%,#f4faf7_100%)] p-4 shadow-[0_1px_1px_rgba(17,25,23,0.03),0_12px_28px_rgba(17,25,23,0.06)]">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                  文档信息
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)]">来源</p>
                    <p className="mt-1 whitespace-nowrap text-[0.8rem] leading-6 text-[var(--text-secondary)]">{doc.source}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)]">字数</p>
                    <p className="mt-1 text-[0.8rem] leading-6 text-[var(--text-secondary)]">
                      {doc.characterCount.toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)]">关键章节</p>
                    <nav className="mt-1 flex flex-col items-start gap-1" aria-label="关键章节">
                      {keySections.map((section) => {
                        const { label, text } = splitSectionTitle(section.title);
                        return (
                          <a
                            className="group text-[0.8rem] leading-5"
                            href={`#${section.id}`}
                            key={section.id}
                          >
                            <span className="text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent-strong)]">
                              {label}. {text}
                            </span>
                          </a>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

function HelpSection({ section }: { section: HelpDocSection }) {
  const { label, text } = splitSectionTitle(section.title);

  return (
    <section className="scroll-mt-24 border-b border-[var(--hairline)] py-10 last:border-b-0 md:py-12" id={section.id}>
      <div className="mb-6 flex items-start gap-4">
        <span className="mono flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-strong)]">
          {label}
        </span>
        <h2 className="text-2xl font-semibold leading-tight text-[var(--text-primary)] md:text-3xl">{text}</h2>
      </div>
      <HelpMarkdown body={section.body} />
    </section>
  );
}

function HelpMarkdown({ body }: { body: string }) {
  const lines = body.split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed || trimmed === "* * *") {
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 className="mt-8 text-xl font-semibold leading-snug text-[var(--text-primary)]" key={index}>
          {renderInline(trimmed.replace(/^###\s+/, ""))}
        </h3>,
      );
      continue;
    }

    const fence = trimmed.match(/^(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      const fenceMarker = fence[1];
      const language = fence[2];
      const codeLines: string[] = [];

      while (index + 1 < lines.length) {
        index += 1;
        const codeLine = lines[index] ?? "";
        if (new RegExp(`^${fenceMarker[0]}{${fenceMarker.length},}\\s*$`).test(codeLine.trim())) break;
        codeLines.push(codeLine);
      }

      blocks.push(<CodeBlock code={codeLines.join("\n")} key={index} language={language} />);
      continue;
    }

    if (line.startsWith("    ")) {
      const codeLines = [line.replace(/^ {4}/, "")];
      while (lines[index + 1]?.startsWith("    ")) {
        index += 1;
        codeLines.push((lines[index] ?? "").replace(/^ {4}/, ""));
      }
      blocks.push(isFlowBlock(codeLines) ? <FlowBlock key={index} lines={codeLines} /> : <ExampleBlock key={index} lines={codeLines} />);
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines = [trimmed];
      while (lines[index + 1]?.trim().startsWith("|")) {
        index += 1;
        tableLines.push((lines[index] ?? "").trim());
      }
      blocks.push(<MarkdownTable key={index} lines={tableLines} />);
      continue;
    }

    if (/^\* /.test(trimmed)) {
      blocks.push(
        <div className="mt-3 flex gap-3 text-base leading-8 text-[var(--text-secondary)]" key={index}>
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
          <p>{renderInline(trimmed.replace(/^\* /, ""))}</p>
        </div>,
      );
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      const item = trimmed.match(/^(\d+)\.\s*(.*)$/);
      blocks.push(
        <div className="mt-3 flex gap-3 text-base leading-8 text-[var(--text-secondary)]" key={index}>
          <span className="mono mt-1 flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--hairline)] text-xs text-[var(--accent-strong)]">
            {item?.[1]}
          </span>
          <p>{renderInline(item?.[2] ?? trimmed)}</p>
        </div>,
      );
      continue;
    }

    blocks.push(
      <p className="mt-4 text-base leading-8 text-[var(--text-secondary)]" key={index}>
        {renderInline(trimmed)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const { headers, rows } = parseMarkdownTable(lines);

  if (!headers.length) {
    return null;
  }

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[0_1px_1px_rgba(17,25,23,0.03),0_12px_28px_rgba(17,25,23,0.06)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[linear-gradient(180deg,#f7fbf9_0%,#eef8f4_100%)]">
            <tr>
              {headers.map((header, headerIndex) => (
                <th
                  className="whitespace-nowrap border-b border-[var(--hairline)] px-4 py-3 text-xs font-semibold text-[var(--accent-strong)]"
                  key={`${header}-${headerIndex}`}
                  scope="col"
                >
                  {renderInline(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--surface-3)]" key={`${row.join("-")}-${rowIndex}`}>
                {headers.map((_, cellIndex) => (
                  <td className="px-4 py-3 align-top leading-7 text-[var(--text-secondary)]" key={`${rowIndex}-${cellIndex}`}>
                    {renderInline(row[cellIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseMarkdownTable(lines: string[]) {
  const parsedRows = lines
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((row) => row.some((cell) => cell) && !row.every(isTableSeparatorCell));

  const headers = parsedRows[0] ?? [];
  const rows = parsedRows.slice(1).map((row) => headers.map((_, index) => row[index] ?? ""));

  return { headers, rows };
}

function isTableSeparatorCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell);
}

function FlowBlock({ lines }: { lines: string[] }) {
  const steps = lines.map((line) => line.trim()).filter((line) => line && !isFlowArrow(line));

  return (
    <ol
      aria-label="流程步骤"
      className="mt-5 rounded-xl border border-[var(--hairline)] bg-[linear-gradient(135deg,#ffffff_0%,#f4fbf8_100%)] p-4 shadow-[0_1px_1px_rgba(17,25,23,0.03),0_12px_28px_rgba(17,25,23,0.06)] md:p-5"
    >
      {steps.map((step, stepIndex) => (
        <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0 md:grid-cols-[2.25rem_minmax(0,1fr)]" key={`${step}-${stepIndex}`}>
          <div className="relative flex justify-center">
            <span className="mono z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-strong)]">
              {stepIndex + 1}
            </span>
            {stepIndex < steps.length - 1 ? (
              <span className="absolute bottom-[-0.75rem] top-8 w-px bg-[linear-gradient(180deg,rgba(0,180,138,0.36),rgba(0,180,138,0.08))]" />
            ) : null}
          </div>
          <div className="rounded-lg border border-[var(--hairline)] bg-white/88 px-4 py-2.5 text-base leading-7 text-[var(--text-primary)]">
            {renderInline(step)}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const label = language === "yaml" ? "YAML 配置示例" : language === "markdown" ? "Markdown 正文模板" : "内容示例";

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[0_1px_1px_rgba(17,25,23,0.03),0_12px_28px_rgba(17,25,23,0.06)]">
      <div className="flex items-center gap-2 border-b border-[var(--hairline)] bg-[linear-gradient(180deg,#f7fbf9_0%,#eef8f4_100%)] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span className="text-xs font-semibold text-[var(--accent-strong)]">{label}</span>
      </div>
      <pre className="overflow-x-auto bg-[var(--surface-2)] p-4 text-sm leading-7 text-[var(--text-primary)] md:p-5">
        <code className="mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function ExampleBlock({ lines }: { lines: string[] }) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-4 text-sm leading-7 text-[var(--text-secondary)] md:p-5">
      <div className="space-y-1.5">
        {lines.map((line, index) => {
          const trimmed = line.trim();

          if (!trimmed) {
            return <div aria-hidden="true" className="h-2" key={`blank-${index}`} />;
          }

          return (
            <p className="rounded-md border border-[var(--hairline)] bg-white/78 px-3 py-2" key={`${trimmed}-${index}`}>
              {renderInline(trimmed)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function isFlowBlock(lines: string[]) {
  const meaningfulLines = lines.map((line) => line.trim()).filter(Boolean);

  return meaningfulLines.some(isFlowArrow) && meaningfulLines.filter((line) => !isFlowArrow(line)).length >= 2;
}

function isFlowArrow(line: string) {
  return line === "↓" || line === "->" || line === "=>";
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong className="font-semibold text-[var(--text-primary)]" key={`${part}-${index}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          className="mono rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.88em] text-[var(--text-primary)]"
          key={`${part}-${index}`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

function splitSectionTitle(title: string) {
  const match = title.match(/^(\d+)\.\s*(.*)$/);

  return {
    label: match?.[1] ?? "·",
    text: match?.[2] ?? title,
  };
}
