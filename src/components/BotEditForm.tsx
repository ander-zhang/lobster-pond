"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotFormFields, type BotFormValues } from "./BotFormFields";
import { FormStatus, type SubmitState } from "./admin/form-primitives";
import type { Bot } from "@/lib/types";

export function BotEditForm({ bot }: { bot: Bot }) {
  const router = useRouter();
  const [values, setValues] = useState<BotFormValues>({
    name: bot.name,
    role: bot.role,
    summary: bot.summary,
    version: bot.version,
    model: bot.model,
    domains: bot.domains.slice(0, 1),
  });
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const isSubmitting = state.kind === "submitting";
  const canSubmit =
    values.name.trim().length > 0 &&
    values.role.trim().length > 0 &&
    values.version.trim().length > 0 &&
    values.model.trim().length > 0 &&
    values.domains.length >= 1 &&
    !isSubmitting;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setState({ kind: "submitting" });

    let response: Response;
    try {
      response = await fetch(`/api/bots?id=${encodeURIComponent(bot.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          role: values.role,
          summary: values.summary.trim(),
          version: values.version,
          model: values.model,
          domains: values.domains,
        }),
      });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
      return;
    }

    if (response.ok) {
      router.push("/me");
      router.refresh();
      return;
    }

    let payload: { error?: string } = {};
    try {
      payload = (await response.json()) as { error?: string };
    } catch {
      // 非 JSON，保留默认。
    }
    setState({
      kind: "error",
      message: typeof payload.error === "string" ? payload.error : `保存失败（HTTP ${response.status}）`,
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <BotFormFields values={values} onChange={setValues} allowMultipleDomains={false} />
      <FormStatus state={state} />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
