"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { DocType } from "@/lib/types";

type DownloadButtonProps = {
  type: DocType;
  id: string;
  // variant: primary = 黑色实心胶囊(详情页主操作)，subtle = 描边小按钮(列表内)。
  variant?: "primary" | "subtle";
  // 技能附件文件名用于区分 .zip 与 .tar.gz；没有附件时默认 .zip。
  filename?: string;
};

function packageSuffix(filename?: string): string {
  const lower = filename?.toLowerCase() ?? "";
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  if (lower.endsWith(".tgz")) return ".tgz";
  return ".zip";
}

// 知识 → 下载 .md；技能 → 下载 .zip 安装包。链接指向实时生成的下载路由。
// 仍用原生 <a download> 让浏览器流式下载（CSP default-src 'self' 下不引入 blob:），
// 但点击后延迟 router.refresh()：下载路由已在服务端把下载次数 +1 落库，
// 刷新会重派生服务端数据，让"下载次数"实时更新，免去手动刷新页面。
// 修饰键 / 中键点击走浏览器原生新窗口行为，跳过刷新。
export function DownloadButton({ type, id, variant = "primary", filename }: DownloadButtonProps) {
  const router = useRouter();
  const href = `/api/docs/${type}/${id}/download`;
  const suffix = packageSuffix(filename);
  const label = type === "knowledge" ? "下载 Markdown" : `下载技能安装包 ${suffix}`;
  const shortLabel = type === "knowledge" ? "下载 .md" : `安装包 ${suffix}`;

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    // 原生下载请求通常在点击事件结束后才发出；同时监听窗口恢复焦点，
    // 覆盖浏览器弹出保存对话框后返回页面的情况。服务端下载路由会先落库再响应。
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh, { once: true });
    window.setTimeout(() => {
      window.removeEventListener("focus", refresh);
      router.refresh();
    }, 1200);
  }

  if (variant === "subtle") {
    return (
      <a
        className="chip-link mono inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
        href={href}
        download
        aria-label={`${label}（${id}）`}
        onClick={handleClick}
      >
        <DownloadIcon />
        {shortLabel}
      </a>
    );
  }

  return (
    <a
      className="btn-primary inline-flex items-center gap-2"
      href={href}
      download
      aria-label={`${label}（${id}）`}
      onClick={handleClick}
    >
      <DownloadIcon />
      {label}
    </a>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
