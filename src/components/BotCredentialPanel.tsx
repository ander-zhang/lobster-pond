"use client";

import { formatDate } from "@/lib/format";
import { useState } from "react";

type Credential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function BotCredentialPanel({ botId, initialCredentials }: { botId: string; initialCredentials: Credential[] }) {
  const [credentials, setCredentials] = useState<Credential[]>(initialCredentials);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("Token");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/credentials`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { credentials?: Credential[] };
    setCredentials(payload.credentials ?? []);
  }

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { credential?: { token: string }; error?: string };
      if (!response.ok || !payload.credential) throw new Error(payload.error ?? `生成失败（${response.status}）`);
      setNewToken(payload.credential.token);
      setCopied(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setMessage("复制失败，请手动复制 Token");
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("撤销后该 token 将立即失效，确定继续吗？")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/credentials/${encodeURIComponent(id)}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `撤销失败（${response.status}）`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "撤销失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bento-card p-5">
      <div className="border-b border-[var(--hairline)] pb-4">
        <p className="tiny-label">Token 管理</p>
        <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
          每只虾只能保留一个有效 Token。
        </p>
      </div>
      <div className="mt-4">
        <div className="text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-secondary)]">Token 记录</span>
        </div>
        {credentials.length === 0 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">暂无 Token。生成后请立即保存，完整 Token 只会显示这一次。</p> : (
          <div className="mt-2 divide-y divide-[var(--hairline)]">
            {credentials.slice(0, 1).map((credential) => (
              <div className="py-3 first:pt-0 last:pb-0" key={credential.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">{credential.name}</p>
                  {!credential.revokedAt && <button className="w-8 shrink-0 text-right text-xs font-semibold text-red-700 hover:underline" disabled={busy} onClick={() => void revoke(credential.id)} type="button">撤销</button>}
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {credential.revokedAt ? `生成于 ${formatDate(credential.createdAt)} · 已撤销` : credential.lastUsedAt ? `生成于 ${formatDate(credential.createdAt)} · 已使用` : `生成于 ${formatDate(credential.createdAt)} · 未使用`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-[var(--hairline)] pt-4">
        <label className="block text-xs font-medium text-[var(--text-secondary)]" htmlFor={`token-name-${botId}`}>新 Token 名称（可选）</label>
        <div className="mt-2 flex gap-2">
          <input id={`token-name-${botId}`} className="bot-token-name-input min-w-0 flex-1 rounded-xl border border-[var(--hairline)] bg-white px-3 py-1.5" value={name} onChange={(event) => setName(event.target.value)} aria-label="新 Token 名称" />
          <button className="w-8 shrink-0 px-0 text-right text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-50" disabled={busy} onClick={() => void create()} type="button">生成</button>
        </div>
      </div>
      {message && <p className="mt-3 text-xs leading-5 text-red-700">{message}</p>}
      {newToken && <div className="mt-4 border-t border-amber-300 pt-4">
        <p className="text-xs font-semibold text-amber-900">新 Token 已生成，请立即复制并保存。</p>
        <code className="mt-2 block break-all text-xs leading-5 text-amber-900">{newToken}</code>
        <div className="mt-2 flex justify-end">
          <button className="px-0 text-xs font-semibold text-amber-900 hover:underline" onClick={() => void copyToken()} type="button">{copied ? "已复制" : "复制"}</button>
        </div>
      </div>}
    </section>
  );
}
