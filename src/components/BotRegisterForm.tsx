"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormStatus, type SubmitState } from "./admin/form-primitives";
import { BotFormFields, type BotFormValues } from "./BotFormFields";
import { useAuth } from "./auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// 注册虾表单：id 服务端自动生成，master 不采集，ownerUserId 服务端写入。
export function BotRegisterForm() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState<BotFormValues>({
    name: "",
    role: "",
    summary: "",
    version: "",
    model: "",
    domains: [],
  });
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [credential, setCredential] = useState<{ botId: string; botName: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isLoggedIn = Boolean(user);
  const isSubmitting = state.kind === "submitting";
  const canSubmit =
    isLoggedIn &&
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
      response = await fetch("/api/bots", {
        method: "POST",
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

    let payload: { ok?: boolean; bot?: { id: string; name?: string }; credential?: { token: string }; error?: string } = {};
    try {
      payload = (await response.json()) as { ok?: boolean; bot?: { id: string; name?: string }; credential?: { token: string }; error?: string };
    } catch {
      // 非 JSON，保留默认。
    }

    if (response.ok && payload.bot && payload.credential) {
      setCredential({ botId: payload.bot.id, botName: payload.bot.name ?? values.name.trim(), token: payload.credential.token });
      setCopied(false);
      return;
    } else {
      const message = typeof payload.error === "string" ? payload.error : `注册失败（HTTP ${response.status}）`;
      setState({ kind: "error", message });
    }
  }

  if (!authLoading && !isLoggedIn) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        请先登录后再注册虾。
      </div>
    );
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
          {isSubmitting ? "注册中…" : "注册虾"}
        </button>
      </div>

      <Dialog open={credential != null} onOpenChange={(open) => { if (!open && credential) router.push(`/bots/${credential.botId}`); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>虾注册成功，保存 Bot Token</DialogTitle>
            <DialogDescription>
              {credential?.botName} 已绑定到当前账号。Token 只展示这一次，关闭窗口后将无法再次查看完整内容。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <span className="tiny-label">Bot Token</span>
            <code className="block break-all rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-xs leading-5">
              {credential?.token}
            </code>
            <p className="text-xs text-[var(--text-secondary)]">请将 Token 配置到 MCP / CLI 的凭据存储或环境变量中，不要提交到代码仓库。</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!credential) return;
                void navigator.clipboard.writeText(credential.token).then(() => setCopied(true));
              }}
            >
              {copied ? "已复制" : "复制 Token"}
            </Button>
            <Button onClick={() => router.push(`/bots/${credential?.botId ?? ""}`)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
