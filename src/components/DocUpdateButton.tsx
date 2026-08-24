"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePenLine, LoaderCircle } from "lucide-react";
import type { DocType } from "@/lib/types";

// 详情页更新按钮：点击后直接打开系统文件选择器，选中文件后立即上传覆盖。
// 可见性由服务端页面按 authorUserId 判定，API 服务层再次校验 owner。
export function DocUpdateButton({ docId, docType }: { docId: string; docType: DocType }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = docType === "knowledge" ? ".md" : ".zip,.tar.gz,.tgz";
  const colorClass = docType === "knowledge"
    ? "bg-[var(--amber)] hover:bg-[var(--amber-strong)]"
    : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]";

  async function update(file: File) {
    setUpdating(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(
        `/api/docs/${docType}/${encodeURIComponent(docId)}/update`,
        { method: "POST", body: form },
      );
      let payload: { ok?: boolean; error?: string; doc?: { id: string } } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        // 非 JSON 响应保留默认错误。
      }
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? `更新失败（HTTP ${response.status}）`);
        return;
      }
      // 更新文件可能带来新的文档 ID；详情页仍在旧 ID 下刷新会落到 404。
      if (payload.doc?.id && payload.doc.id !== docId) {
        router.replace(`/library/${docType}/${encodeURIComponent(payload.doc.id)}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("网络请求失败，请检查服务是否在运行");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void update(file);
        }}
      />
      <button
        type="button"
        disabled={updating}
        onClick={() => inputRef.current?.click()}
        className={`group flex size-9 items-center justify-center rounded-full text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:shadow-[var(--shadow-hover)] active:scale-95 disabled:pointer-events-none disabled:opacity-60 ${colorClass}`}
        aria-label="更新文档"
        title={updating ? "更新中…" : `更新文档（选择 ${accept} 文件）`}
      >
        {updating ? <LoaderCircle className="size-5 animate-spin" /> : <FilePenLine className="size-5" />}
      </button>
      {error ? (
        <p
          className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-[var(--hairline)] bg-white p-2 text-xs leading-5 text-[var(--rose-strong)] shadow-[var(--shadow-hover)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
