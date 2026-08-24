import Link from "next/link";
import { HeatBar } from "@/components/HeatBar";
import { StateBadge } from "@/components/StateBadge";
import { DownloadButton } from "@/components/DownloadButton";
import { domainBadgeClass, domainLabel, scenarioLabel } from "@/lib/format";
import type { MarkdownDoc } from "@/lib/types";

export function LibraryDocCard({ doc, references, maxRefs, authorName, filename }: {
  doc: MarkdownDoc;
  references: number;
  maxRefs: number;
  authorName: string | null;
  filename?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-white/78 p-4 transition duration-150 ease-out hover:border-[#b9d7ea] hover:bg-[var(--surface-2)] hover:shadow-[0_16px_34px_rgba(42,67,101,0.12)]">
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={doc.contentState} size="sm" label="已批准" />
        <span className="mono rounded-md border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">{doc.id}</span>
        <span className="ml-auto"><HeatBar max={maxRefs} suffix=" 次引用" value={references} /></span>
      </div>
      <Link className="group block" href={`/library/${doc.type}/${doc.id}`}>
        <h3 className="mt-3 text-base font-semibold tracking-[-0.01em] transition-colors group-hover:text-[var(--accent-strong)]">{doc.title}</h3>
        <p className="muted mt-2 text-sm leading-6 truncate">{doc.summary}</p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc.type === "knowledge" && doc.domain ? (
          <span className={`rounded-full px-2 py-1 text-xs ${domainBadgeClass(doc.domain)}`}>
            {domainLabel(doc.domain)}
          </span>
        ) : null}
        {doc.type === "skills" && doc.scenario ? (
          <span className="rounded-full border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {scenarioLabel(doc.scenario ?? null)}
          </span>
        ) : null}
        {doc.type === "knowledge" && doc.category ? (
          <span className="rounded-full border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {doc.category}
          </span>
        ) : null}
        {doc.type === "knowledge" && doc.subtype ? (
          <span className="rounded-full border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {doc.subtype}
          </span>
        ) : null}
        <DownloadButton type={doc.type} id={doc.id} filename={filename} variant="subtle" />
        <span className="text-xs text-[var(--text-muted)]">{authorName ?? "未署名"}</span>
      </div>
    </div>
  );
}
