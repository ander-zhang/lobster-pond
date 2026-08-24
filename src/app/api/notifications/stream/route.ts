import { getNotifications } from "@/lib/services/notification-service";
import { getCurrentUser } from "@/lib/services/session";
import { subscribeToReplyNotifications } from "@/lib/notification-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let sending = false;
  let pending = false;

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        unsubscribe?.();
        controller.close();
      };

      request.signal.addEventListener("abort", close);

      const sendNotifications = async () => {
        if (closed) return;
        if (sending) {
          pending = true;
          return;
        }
        sending = true;
        try {
          const payload = await getNotifications(user.id);
          if (!closed) {
            controller.enqueue(encoder.encode(`event: notifications\ndata: ${JSON.stringify(payload)}\n\n`));
          }
        } catch {
          // 查询失败时保持连接，等待后续事件或自动重连。
        } finally {
          sending = false;
          if (pending) {
            pending = false;
            void sendNotifications();
          }
        }
      };

      try {
        // 先订阅再读取，避免连接建立期间漏掉事件。
        unsubscribe = await subscribeToReplyNotifications(user.id, () => void sendNotifications());
        await sendNotifications();
      } catch {
        close();
        return;
      }

      keepAlive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 20_000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      unsubscribe?.();
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
