"use client";

import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemo, useState } from "react";
import type { DateRange, DropdownNavProps, DropdownProps } from "react-day-picker";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DateRangeFilterProps = {
  // YYYY-MM-DD，与原 <input type="date"> 一致；空串表示未选。
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
};

// 将 YYYY-MM-DD 解析为本地 Date（按年月日直接构造，避免 date-only 串被当成 UTC 解析）。
function parseDateKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// 将 Calendar 选中的 Date 转回 YYYY-MM-DD，取日期本身的本地年月日，
// 不做时区归桶——保持与原 <input type="date"> 的比较语义一致
// （filterPosts 侧的 postDate 才按 Asia/Shanghai 归桶）。
function dateToLocalKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// react-day-picker 的 Dropdown 期望收到 ChangeEvent；radix Select 只给 value 字符串，
// 这里把 value 包成合成的 ChangeEvent 再交还。
function emitChangeEvent(
  value: string | number,
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void,
) {
  onChange({
    target: { value: String(value) },
  } as React.ChangeEvent<HTMLSelectElement>);
}

export function DateRangeFilter({ dateFrom, dateTo, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo<DateRange | undefined>(() => {
    const from = parseDateKey(dateFrom);
    const to = parseDateKey(dateTo);
    if (!from && !to) return undefined;
    return { from, to };
  }, [dateFrom, dateTo]);

  // 每次打开 popover 都会重新挂载 Calendar，defaultMonth 决定初始展示到哪个月。
  const defaultMonth = useMemo(
    () => parseDateKey(dateFrom) ?? parseDateKey(dateTo) ?? new Date(),
    [dateFrom, dateTo],
  );

  const hasValue = Boolean(dateFrom || dateTo);
  const label = dateFrom && dateTo
    ? `${dateFrom} → ${dateTo}`
    : dateFrom
      ? `${dateFrom} 起`
      : dateTo
        ? `截至 ${dateTo}`
        : "选择日期范围";

  function handleSelect(range: DateRange | undefined) {
    onChange({
      dateFrom: range?.from ? dateToLocalKey(range.from) : "",
      dateTo: range?.to ? dateToLocalKey(range.to) : "",
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[0_8px_18px_rgba(42,67,101,0.06)] transition-colors hover:border-[var(--hairline-strong)]">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)]"
            aria-label="日期范围"
          >
            <CalendarIcon className="size-4 shrink-0 text-[var(--text-muted)]" />
            <span className={cn("truncate", !hasValue && "text-[var(--text-muted)]")}>
              {label}
            </span>
          </button>
        </PopoverTrigger>
        {hasValue ? (
          <button
            type="button"
            onClick={() => onChange({ dateFrom: "", dateTo: "" })}
            aria-label="清除日期"
            className="flex items-center px-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={defaultMonth}
          startMonth={new Date(2026, 0)}
          endMonth={new Date()}
          numberOfMonths={1}
          captionLayout="dropdown"
          formatters={{ formatMonthDropdown: (month) => `${month.getMonth() + 1} 月` }}
          hideNavigation
          className="rounded-lg border border-border bg-background p-2"
          classNames={{ month_caption: "mx-0" }}
          components={{
            DropdownNav: (props: DropdownNavProps) => (
              <div className="flex w-full items-center gap-2">{props.children}</div>
            ),
            Dropdown: (props: DropdownProps) => (
              <Select
                value={String(props.value)}
                onValueChange={(value) => {
                  if (props.onChange) {
                    emitChangeEvent(value, props.onChange);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-fit font-medium first:grow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(26rem,var(--radix-select-content-available-height))]">
                  {props.options?.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={String(option.value)}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
