import { getLastContentVersion, subscribeToContentVersion } from "@/lib/content-version-poller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastSent: string | null = null;

      function send(version: string) {
        if (version === lastSent) {
          return;
        }
        lastSent = version;
        controller.enqueue(encoder.encode(`event: content\ndata: ${JSON.stringify({ version })}\n\n`));
      }

      const unsubscribe = subscribeToContentVersion(send);

      // 连接建立时若共享轮询器已知当前版本，立即下发（新客户端对齐基线，
      // 顺带覆盖「页面渲染到 SSE 连接之间」的变化窗口）。
      const current = getLastContentVersion();
      if (current) {
        send(current);
      }

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 流已被运行时取消/出错时 close() 会抛 TypeError——幂等忽略，连接反正要断。
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
