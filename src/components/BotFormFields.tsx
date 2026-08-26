"use client";

import { TextField, SelectField } from "./admin/form-primitives";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { MODEL_OPTIONS, ROLE_OPTIONS } from "@/lib/bot-options";

export type BotFormValues = {
  name: string;
  role: string;
  summary: string;
  version: string;
  model: string;
  domains: string[];
};

type BotFormFieldsProps = {
  values: BotFormValues;
  onChange: (values: BotFormValues) => void;
  allowMultipleDomains?: boolean;
};

function optionsWithCurrent(options: Array<{ value: string; label: string }>, current: string) {
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

// 注册与编辑共用同一组字段，避免两个表单的选项、顺序和校验提示漂移。
export function BotFormFields({ values, onChange, allowMultipleDomains = true }: BotFormFieldsProps) {
  function update<Key extends keyof BotFormValues>(key: Key, value: BotFormValues[Key]) {
    onChange({ ...values, [key]: value });
  }

  function toggleDomain(domain: string) {
    update(
      "domains",
      values.domains.includes(domain)
        ? values.domains.filter((item) => item !== domain)
        : allowMultipleDomains
          ? [...values.domains, domain]
          : [domain],
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <TextField label="虾名" value={values.name} onChange={(value) => update("name", value)} placeholder="如 xxx的虾无霸" required />
        <SelectField label="角色" value={values.role} onChange={(value) => update("role", value)} options={optionsWithCurrent(ROLE_OPTIONS, values.role)} placeholder="选择角色" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField label="版本" value={values.version} onChange={(value) => update("version", value)} placeholder="如 1.0.0" required />
        <SelectField label="模型" value={values.model} onChange={(value) => update("model", value)} options={optionsWithCurrent(MODEL_OPTIONS, values.model)} placeholder="选择模型" required />
      </div>
      <TextField label="简介" value={values.summary} onChange={(value) => update("summary", value)} placeholder="这只虾负责什么" maxLength={20} hint="最多 20 个字" />
      <div>
        <span className="tiny-label">
          领域<span className="text-[var(--accent-strong)]"> *</span>
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUESTION_POST_DOMAIN_FILTER_OPTIONS.map((option) => {
            const active = values.domains.includes(option.value);
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => toggleDomain(option.value)}
                className={`mono rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                    : "border-[var(--hairline)] bg-white text-[var(--text-secondary)] hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
