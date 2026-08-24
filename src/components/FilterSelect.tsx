"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterSelectOption = { value: string; label: string };

// 通用筛选项：tiny-label + radix Select，首项默认为"全部"。
// 问题帖列表页与审核治理页的"观察中的问题帖"队列共用，保证两处筛选 UI 一致。
// includeAll=false 时去掉"全部"项（如技能上传必须选定具体领域），并用 placeholder 提示。
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  includeAll = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  includeAll?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="block">
      <span className="tiny-label">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2 w-full" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeAll ? <SelectItem value="all">全部</SelectItem> : null}
          {options.map((option) => (
            <SelectItem value={option.value} key={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
