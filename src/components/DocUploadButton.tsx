"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DocType } from "@/lib/types";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { categoriesForDomain, subtypesForDomainCategory } from "@/lib/knowledge-taxonomy";
import { SKILL_SCENARIO_OPTIONS } from "@/lib/skill-scenarios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "./FilterSelect";

type DocUploadButtonProps = {
  type: DocType;
};

// 知识库卡片右上角的上传入口：知识收 .md（琥珀色），技能收 .zip（薄荷绿）。
// 两类统一走弹窗流程——知识选所属领域 / 种别 / 类型，技能选所属场景，再选文件，确认后上传；
// 所选分类随表单提交并覆盖 frontmatter 里的 domain（知识）/ scenario（技能）。
// 用户通过网页上传的内容直接批准，上传成功后返回知识库列表。
export function DocUploadButton({ type }: DocUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [scenario, setScenario] = useState("");
  const [category, setCategory] = useState("");
  const [subtype, setSubtype] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isKnowledge = type === "knowledge";
  const accept = isKnowledge ? ".md" : ".zip,.tar.gz,.tgz";
  const label = isKnowledge ? "上传知识" : "上传技能";
  const colorClass = isKnowledge
    ? "bg-[var(--amber)] hover:bg-[var(--amber-strong)]"
    : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]";
  const filePlaceholder = isKnowledge ? "选择 .md 文件" : "选择 .zip 或 .tar.gz 文件";
  const dialogTitle = isKnowledge ? "上传知识" : "上传技能";
  const dialogDescription = isKnowledge
    ? "选择该知识的种别与类型（有类型的种别才选类型）及所属领域，上传 .md 文件后立即发布；id 由系统自动分配"
    : "选择该技能所属场景并上传压缩包，上传后立即发布";

  // 种别/类型按所选领域派生：平台运营 10 种别（仅体系 4 类型），其余领域默认 6。
  const categoryOptions = domain
    ? categoriesForDomain(domain).map((c) => ({ value: c, label: c }))
    : [];
  const subtypeOptions = category
    ? subtypesForDomainCategory(domain, category).map((s) => ({ value: s, label: s }))
    : [];
  const needsSubtype = Boolean(category) && subtypeOptions.length > 0;
  const scenarioOptions = SKILL_SCENARIO_OPTIONS.map((s) => ({ value: s, label: s }));

  async function handleFile(file: File, domain: string, scenario: string, category: string, subtype: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("file", file);
      if (isKnowledge) {
        // 知识：领域 / 种别 / 类型随表单提交并覆盖 frontmatter。
        if (domain) form.set("domain", domain);
        if (category) form.set("category", category);
        if (subtype) form.set("subtype", subtype);
      } else {
        // 技能：场景随表单提交并覆盖 SKILL.md frontmatter 里的 scenario。
        if (scenario) form.set("scenario", scenario);
      }
      const res = await fetch("/api/docs/upload", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "上传失败");
        return false;
      }
      router.push("/library");
      return true;
    } catch {
      setError("网络错误，上传失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmUpload() {
    if (!file) return;
    // 知识须选领域（静默守卫，按钮已禁用）；技能须选场景（按钮禁用外补一条错误提示）。
    if (isKnowledge) {
      if (!domain) return;
    } else if (!scenario) {
      setError("请选择场景");
      return;
    }
    // 知识须选种别（id 由系统自动分配，种别是 id 的一部分）。
    if (isKnowledge && !category) {
      setError("请选择知识种别");
      return;
    }
    // 有类型的种别须选类型（领域级级联，无类型种别留空）。
    if (isKnowledge && needsSubtype && !subtype) {
      setError("请选择知识类型");
      return;
    }
    const ok = await handleFile(file, domain, scenario, category, isKnowledge ? subtype : "");
    if (ok) {
      setDialogOpen(false);
      setFile(null);
      setDomain("");
      setScenario("");
      setCategory("");
      setSubtype("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && !dialogOpen ? (
        <span className="max-w-[12rem] truncate text-xs text-[var(--rose-strong)]" title={error}>
          {error}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const f = event.target.files?.[0];
          if (f) setFile(f);
          event.target.value = "";
        }}
      />
      <UploadIconButton
        label={label}
        colorClass={colorClass}
        onClick={() => {
          setError(null);
          setDialogOpen(true);
        }}
        disabled={busy}
      />
      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setError(null);
            setDomain("");
            setScenario("");
            setCategory("");
            setSubtype("");
            setFile(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isKnowledge ? (
              <FilterSelect
                label="领域"
                value={domain}
                onChange={(value) => {
                  setDomain(value);
                  setCategory(""); // 换领域时清空种别/类型（级联）。
                  setSubtype("");
                }}
                options={QUESTION_POST_DOMAIN_FILTER_OPTIONS}
                includeAll={false}
                placeholder="选择领域"
              />
            ) : (
              <FilterSelect
                label="场景"
                value={scenario}
                onChange={setScenario}
                options={scenarioOptions}
                includeAll={false}
                placeholder="选择场景"
              />
            )}
            {/* 逐级显示（与知识库页筛选一致）：种别仅在领域选定后出现，类型仅在该种别有类型时出现。 */}
            {isKnowledge && domain ? (
              <>
                <FilterSelect
                  label="种别"
                  value={category}
                  onChange={(value) => {
                    setCategory(value);
                    setSubtype(""); // 换种别时清空类型（级联）。
                  }}
                  options={categoryOptions}
                  includeAll={false}
                  placeholder="选择种别"
                />
                {needsSubtype ? (
                  <FilterSelect
                    label="类型"
                    value={subtype}
                    onChange={setSubtype}
                    options={subtypeOptions}
                    includeAll={false}
                    placeholder="选择类型"
                  />
                ) : null}
              </>
            ) : null}
            <div className="block">
              <span className="tiny-label">{isKnowledge ? "知识文件" : "技能包"}</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-2 flex w-full items-center gap-2 rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-left text-sm shadow-[0_8px_18px_rgba(42,67,101,0.06)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                <UploadIcon className="size-4 shrink-0 text-[var(--text-muted)]" />
                <span className={`truncate ${file ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                  {file ? file.name : filePlaceholder}
                </span>
              </button>
            </div>
            {error ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button
              className={`${isKnowledge ? "bg-[var(--amber)] hover:bg-[var(--amber-strong)]" : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"} text-white`}
              onClick={() => void confirmUpload()}
              disabled={busy || !file || (isKnowledge ? !domain : !scenario) || (isKnowledge && !category) || (isKnowledge && needsSubtype && !subtype)}
            >
              {busy ? "上传中…" : "确认上传"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 上传图标：向上箭头 + 底座，与 DownloadButton 的描边风格一致。
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

// 圆形填充上传按钮：label/colorClass 由调用方按文档类型传入（知识琥珀 / 技能薄荷绿）。
function UploadIconButton({
  label,
  colorClass,
  onClick,
  disabled,
}: {
  label: string;
  colorClass: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={disabled ? "上传中…" : label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors disabled:opacity-60 ${colorClass}`}
    >
      <UploadIcon />
    </button>
  );
}
