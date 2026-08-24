"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TextField, TextArea, SelectField, FormStatus, type SubmitState } from "./admin/form-primitives";
import { useAuth } from "./auth/AuthProvider";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { buildPostPayload, type PostFormState } from "@/lib/post-publish-payload";

const EMPTY_FORM: PostFormState = {
  title: "",
  summary: "",
  domain: "",
  problemType: "",
  triggerScenario: "",
  triedMethods: "",
  currentResult: "",
};

// 各待填项的填写要求：title / summary / domain 与服务端 schema 对齐，
// problemType / triggerScenario / triedMethods / currentResult 入 fields 记录（服务端要求非空），
// 此处设更高门槛引导填写。
const FIELD_REQUIREMENTS = {
  title: "至少 3 个字符",
  summary: "至少 10 个字符",
  domain: "请选择一个领域",
  problemType: "至少 2 个字符，如 事件记录 / 故障 / 配置变更",
  triggerScenario: "至少 5 个字符",
  triedMethods: "至少 5 个字符",
  currentResult: "至少 5 个字符",
} as const;

// 发布按钮始终可点击：点击发布时再统一校验，未达标项在顶部提示其具体要求。
function validatePostForm(form: PostFormState): string[] {
  const errors: string[] = [];
  if (form.title.trim().length < 3) errors.push(`标题：${FIELD_REQUIREMENTS.title}`);
  if (form.domain.trim().length === 0) errors.push(`领域：${FIELD_REQUIREMENTS.domain}`);
  if (form.problemType.trim().length < 2) errors.push(`问题类型：${FIELD_REQUIREMENTS.problemType}`);
  if (form.triggerScenario.trim().length < 5) errors.push(`触发场景：${FIELD_REQUIREMENTS.triggerScenario}`);
  if (form.summary.trim().length < 10) errors.push(`遇到的问题：${FIELD_REQUIREMENTS.summary}`);
  if (form.triedMethods.trim().length < 5) errors.push(`已尝试方法：${FIELD_REQUIREMENTS.triedMethods}`);
  if (form.currentResult.trim().length < 5) errors.push(`当前结果：${FIELD_REQUIREMENTS.currentResult}`);
  return errors;
}

// 发布问题帖表单：发布者由服务端从会话自动捕获，前端不传 botId/authorUserId。
// 未登录时只显示提示（AuthProvider 会自动弹登录窗）。
export function PostPublishForm() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<PostFormState>(EMPTY_FORM);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const isLoggedIn = Boolean(user);
  const isSubmitting = state.kind === "submitting";

  function update(field: keyof PostFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    // 点击发布后才校验：哪一项不达标就提示该项目的具体要求，让用户知道如何补全。
    const errors = validatePostForm(form);
    if (errors.length > 0) {
      setState({ kind: "error", message: `请完善以下待填项：${errors.join("；")}` });
      return;
    }

    setState({ kind: "submitting" });

    let response: Response;
    try {
      response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPostPayload(form)),
      });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
      return;
    }

    let payload: { ok?: boolean; post?: { id: string }; error?: string } = {};
    try {
      payload = (await response.json()) as { ok?: boolean; post?: { id: string }; error?: string };
    } catch {
      // 非 JSON 响应，保留默认空对象。
    }

    if (response.ok && payload.post) {
      router.push(`/posts/${payload.post.id}`);
    } else {
      const message = typeof payload.error === "string" ? payload.error : `提交失败（HTTP ${response.status}）`;
      setState({ kind: "error", message });
    }
  }

  if (!authLoading && !isLoggedIn) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        请先登录后再发布问题帖
      </div>
    );
  }

  return (
    <form className="bento-card space-y-4 p-6 md:p-8" onSubmit={submit}>
      <p className="tiny-label">发布问题帖</p>
      <div className="grid gap-4 md:grid-cols-6">
        <div className="md:col-span-4">
          <TextField
            label="标题"
            value={form.title}
            onChange={(v) => update("title", v)}
            placeholder="一句话概括问题"
            hint={FIELD_REQUIREMENTS.title}
            required
          />
        </div>
        <div className="md:col-span-2">
          <SelectField
            label="领域"
            value={form.domain}
            onChange={(v) => update("domain", v)}
            options={QUESTION_POST_DOMAIN_FILTER_OPTIONS}
            placeholder="选择领域"
            hint={FIELD_REQUIREMENTS.domain}
            required
          />
        </div>
        <div className="md:col-span-3">
          <TextField
            label="问题类型"
            value={form.problemType}
            onChange={(v) => update("problemType", v)}
            placeholder="如 事件记录 / 故障 / 配置变更"
            hint={FIELD_REQUIREMENTS.problemType}
            required
          />
        </div>
        <div className="md:col-span-3">
          <TextField
            label="触发场景"
            value={form.triggerScenario}
            onChange={(v) => update("triggerScenario", v)}
            placeholder="在什么场景或条件下会触发该问题"
            hint={FIELD_REQUIREMENTS.triggerScenario}
            required
          />
        </div>
        <div className="md:col-span-6">
          <TextArea
            label="遇到的问题"
            value={form.summary}
            onChange={(v) => update("summary", v)}
            placeholder="遇到的问题、现象与背景"
            hint={FIELD_REQUIREMENTS.summary}
            rows={5}
            required
          />
        </div>
        <div className="md:col-span-3">
          <TextArea
            label="已尝试方法"
            value={form.triedMethods}
            onChange={(v) => update("triedMethods", v)}
            placeholder="为解决该问题已经做过的尝试"
            hint={FIELD_REQUIREMENTS.triedMethods}
            rows={3}
            required
          />
        </div>
        <div className="md:col-span-3">
          <TextArea
            label="当前结果"
            value={form.currentResult}
            onChange={(v) => update("currentResult", v)}
            placeholder="上述尝试后目前的状况"
            hint={FIELD_REQUIREMENTS.currentResult}
            rows={3}
            required
          />
        </div>
      </div>
      <FormStatus state={state} />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "发布中…" : "发布"}
        </button>
      </div>
    </form>
  );
}
