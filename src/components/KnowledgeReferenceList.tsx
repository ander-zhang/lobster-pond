import type { MarkdownDoc } from "@/lib/types";
import { domainLabel, scenarioLabel } from "@/lib/format";
import { IconBadge } from "./IconBadge";
import { SkillChip } from "./SkillChip";

type KnowledgeReferenceListProps = {
  title?: string;
  docs: MarkdownDoc[];
  emptyLabel?: string;
};

export function KnowledgeReferenceList({
  title = "引用的知识",
  docs,
  emptyLabel = "暂未关联引用。",
}: KnowledgeReferenceListProps) {
  return (
    <section className="bento-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconBadge icon="book" tone="amber" shape="square" size="sm" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        <span className="mono text-xs text-[var(--text-muted)]">已关联 {docs.length} 条</span>
      </div>

      {docs.length === 0 ? (
        <p className="muted mt-4 text-sm">{emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {docs.map((doc) => (
            <article className="rounded-2xl border border-[var(--hairline)] bg-white/78 p-4" key={doc.id}>
              <div className="flex flex-wrap items-center gap-2">
                <SkillChip doc={doc} />
                <span className="mono text-xs text-[var(--text-muted)]">
                  {doc.type === "knowledge" ? domainLabel(doc.domain) : scenarioLabel(doc.scenario ?? null)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{doc.summary}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
