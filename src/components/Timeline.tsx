import type { TimelineEvent } from "@/lib/types";

type TimelineProps = {
  events: TimelineEvent[];
};

export function Timeline({ events }: TimelineProps) {
  return (
    <ol className="space-y-4">
      {events.map((event, index) => (
        <li className="relative grid grid-cols-[56px_1fr] gap-4" key={`${event.time}-${event.label}`}>
          <div className="mono text-xs text-[var(--text-muted)]">{event.time}</div>
          <div className="relative pb-4">
            {index < events.length - 1 ? (
              <span className="absolute left-[-19px] top-4 h-full w-px bg-[var(--hairline)]" />
            ) : null}
            <span className="absolute left-[-24px] top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--accent)] bg-white shadow-[0_0_0_4px_var(--accent-soft)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">{event.label}</p>
            <p className="muted mt-1 text-sm leading-6">{event.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
