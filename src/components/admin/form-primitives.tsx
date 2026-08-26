"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-base text-[var(--text-primary)] shadow-[0_8px_18px_rgba(42,67,101,0.06)] focus:border-[var(--accent)] focus:outline-none";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="tiny-label">
        {label}
        {required ? <span className="text-[var(--accent-strong)]"> *</span> : null}
      </span>
      <input
        className={inputClass}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-xs text-[var(--text-muted)]">
        {hint ? <span className="block">{hint}</span> : null}
        {maxLength !== undefined ? (
          <span className="block text-right tabular-nums">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="tiny-label">
        {label}
        {required ? <span className="text-[var(--accent-strong)]"> *</span> : null}
      </span>
      <textarea
        className={inputClass}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-xs text-[var(--text-muted)]">
        {hint ? <span className="block">{hint}</span> : null}
        {maxLength !== undefined ? (
          <span className="block text-right tabular-nums">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="block">
      <span className="tiny-label">
        {label}
        {required ? <span className="text-[var(--accent-strong)]"> *</span> : null}
      </span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="mt-2 w-full" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem value={option.value} key={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </div>
  );
}

export type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function FormStatus({ state }: { state: SubmitState }) {
  if (state.kind === "idle" || state.kind === "submitting") {
    return null;
  }
  const success = state.kind === "success";
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm ${
        success
          ? "border-[var(--mint-soft,#bfe9d8)] bg-[rgba(92,201,167,0.12)] text-[var(--text-primary)]"
          : "border-[var(--amber-soft,#f2d49b)] bg-[rgba(240,180,80,0.12)] text-[var(--text-primary)]"
      }`}
    >
      {success ? "✓ " : "⚠ "}
      {state.message}
    </div>
  );
}
