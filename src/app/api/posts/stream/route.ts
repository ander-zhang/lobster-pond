import { getLastVersion, subscribeToPostListVersion } from "@/lib/post-list-version-poller";

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
        controller.enqueue(encoder.encode(`event: posts\ndata: ${JSON.stringify({ version })}\n\n`));
      }

      const unsubscribe = subscribeToPostListVersion(send);

      // Emit the current version immediately if the shared poller already knows it.
      const current = getLastVersion();
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
