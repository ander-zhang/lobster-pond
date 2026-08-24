"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 全站内容实时刷新：订阅 /api/content/stream，版本变化即 router.refresh()
// 重渲染当前路由（服务端组件全量重取，客户端组件 state 保留）。
// 首个事件即刷新：服务端连接建立时立即下发当前版本，若与页面渲染之后的数据
// 有出入（渲染到连接之间的变化窗口），首刷新正好补齐；无变化时只是一次多余
// 的 RSC 请求，可忽略。无 EventSource 环境降级为每 10 秒定时刷新。
export function LiveRefresh() {
  const router = useRouter();
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      const timer = window.setInterval(() => router.refresh(), 10_000);
      return () => window.clearInterval(timer);
    }

    const events = new EventSource("/api/content/stream");
    events.addEventListener("content", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { version: string };
        if (payload.version !== versionRef.current) {
          versionRef.current = payload.version;
          router.refresh();
        }
      } catch {
        // 忽略格式异常的单条 SSE，保持连接等待下一次推送。
      }
    });

    return () => events.close();
  }, [router]);

  return null;
}
