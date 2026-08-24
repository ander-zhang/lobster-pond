import { EventEmitter } from "node:events";
import { getPool } from "./db.ts";

type ReplyNotificationEvent = {
  recipientUserId: string;
};

const CHANNEL = "reply_notification";
const emitter = new EventEmitter();
let listenerReady: Promise<void> | null = null;

function resetListener(error: unknown): void {
  listenerReady = null;
  if (error) {
    // 监听连接断开时，下一条 SSE 连接会尝试重新建立监听。
  }
}

async function ensureListener(): Promise<void> {
  if (listenerReady) return listenerReady;

  listenerReady = (async () => {
    const client = await getPool().connect();
    let released = false;

    const release = () => {
      if (!released) {
        released = true;
        client.release();
      }
    };

    client.on("notification", (message) => {
      if (!message.payload) return;
      try {
        const event = JSON.parse(message.payload) as ReplyNotificationEvent;
        if (event.recipientUserId) emitter.emit(event.recipientUserId);
      } catch {
        // 忽略格式错误的数据库通知。
      }
    });
    client.on("error", (error) => {
      resetListener(error);
      release();
    });
    client.on("end", () => {
      resetListener(undefined);
      release();
    });

    try {
      await client.query(`listen ${CHANNEL}`);
    } catch (error) {
      resetListener(error);
      release();
      throw error;
    }
  })();

  try {
    await listenerReady;
  } catch (error) {
    listenerReady = null;
    throw error;
  }
}

export async function subscribeToReplyNotifications(
  userId: string,
  listener: () => void,
): Promise<() => void> {
  await ensureListener();
  emitter.on(userId, listener);
  return () => emitter.off(userId, listener);
}
