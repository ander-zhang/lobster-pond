"use client";

import { useMemo, useState } from "react";
import {
  assessReviewRequirement,
  buildTemplateDraft,
  type ReviewAssessmentInput,
  type WorkbenchTemplate,
} from "@/lib/help-workbench";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HelpOperationsPanelProps = {
  templates: WorkbenchTemplate[];
};

const riskOptions: Array<{
  key: keyof ReviewAssessmentInput;
  label: string;
}> = [
  { key: "touchesSensitiveData", label: "包含隐私、Token、未脱敏数据" },
  { key: "touchesProductionSystem", label: "涉及生产系统、权限、外发或写入" },
  { key: "conflictsExistingKnowledge", label: "与已有知识可能冲突" },
  { key: "replacesOldRule", label: "替代旧规则或旧版本流程" },
];

export function HelpOperationsPanel({ templates }: HelpOperationsPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string>(templates[0]?.key ?? "question");
  const [copyState, setCopyState] = useState("复制草稿");
  const [assessmentInput, setAssessmentInput] = useState<ReviewAssessmentInput>({
    touchesSensitiveData: false,
    touchesProductionSystem: false,
    conflictsExistingKnowledge: false,
    replacesOldRule: false,
  });

  const selectedTemplate = templates.find((template) => template.key === selectedKey) ?? templates[0];
  const draft = useMemo(() => (selectedTemplate ? buildTemplateDraft(selectedTemplate) : ""), [selectedTemplate]);
  const assessment = assessReviewRequirement(assessmentInput);

  async function copyDraft() {
    if (!draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);
      setCopyState("已复制");
    } catch {
      setCopyState("请手动复制");
    }
  }

  function updateRisk(key: keyof ReviewAssessmentInput, checked: boolean) {
    setAssessmentInput((current) => ({ ...current, [key]: checked }));
  }

  return (
    <section className="scroll-mt-24 rounded-xl border border-[var(--hairline)] bg-[linear-gradient(135deg,#ffffff_0%,#f6fbf9_100%)] p-5 shadow-[0_1px_1px_rgba(17,25,23,0.03),0_12px_28px_rgba(17,25,23,0.06)]" id="operations">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="tiny-label text-[var(--accent-strong)]">模板生成器</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">选择操作模板，生成可复制草稿</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            这里不替代审核流程，只把帮助文档里的字段转成可填写结构，并同步给出审核判断。
          </p>
        </div>
        <button className="btn-primary" onClick={copyDraft} type="button">
          {copyState}
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="template-select">
            操作类型
          </label>
          <Select
            value={selectedKey}
            onValueChange={(value) => {
              setSelectedKey(value);
              setCopyState("复制草稿");
            }}
          >
            <SelectTrigger id="template-select" className="mt-2 w-full" aria-label="操作类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.key} value={template.key}>
                  {template.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <textarea
            className="mt-4 min-h-80 w-full resize-y rounded-xl border border-[var(--hairline)] bg-white p-4 font-[var(--font-mono)] text-sm leading-7 text-[var(--text-primary)]"
            readOnly
            value={draft}
          />
        </div>

        <aside className="rounded-xl border border-[var(--hairline)] bg-white/78 p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">审核判断</p>

          <div className="mt-4 space-y-3">
            {riskOptions.map((option) => (
              <label className="flex gap-3 text-sm leading-6 text-[var(--text-secondary)]" key={option.key}>
                <input
                  checked={Boolean(assessmentInput[option.key])}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  onChange={(event) => updateRisk(option.key, event.target.checked)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <div className={`mt-5 rounded-xl border p-4 ${assessment.mode === "manual" ? "border-[var(--rose-soft)] bg-[#fff6f4]" : "border-[var(--hairline)] bg-[var(--surface-3)]"}`}>
            <p className={`text-sm font-semibold ${assessment.mode === "manual" ? "text-[var(--rose-strong)]" : "text-[var(--accent-strong)]"}`}>
              {assessment.title}
            </p>
            <ul className="mt-3 space-y-2">
              {assessment.reasons.map((reason) => (
                <li className="text-sm leading-6 text-[var(--text-secondary)]" key={reason}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
