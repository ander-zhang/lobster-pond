import Link from "next/link";
import type { MarkdownDoc } from "@/lib/types";

type SkillChipProps = {
  doc: MarkdownDoc;
  compact?: boolean;
};

export function SkillChip({ doc, compact = false }: SkillChipProps) {
  const href = `/library/${doc.type}/${doc.id}`;

  return (
    <Link
      className="chip-link mono inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs text-[var(--text-secondary)] shadow-[0_1px_1px_rgba(17,25,23,0.03)]"
      href={href}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]" />
      {compact ? doc.id : doc.title}
    </Link>
  );
}
