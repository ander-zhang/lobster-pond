import { getContentVersion } from "./content-version.ts";

const CHECK_INTERVAL_MS = 5000;

type Listener = (version: string) => void;

// 进程级共享轮询器（与 post-list-version-poller.ts 同构）：N 个 SSE 连接共享
// 同一次 getContentVersion() 调用；引用计数，首个订阅者到来才启动 interval，
// 最后一个离开即停止并清空版本。全站内容变了才向订阅者推送新版本串。
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastVersion: string | null = null;

async function poll() {
  const version = await getContentVersion();
  if (version === lastVersion) {
    return;
  }
  lastVersion = version;
  for (const listener of listeners) {
    listener(version);
  }
}

export function getLastContentVersion() {
  return lastVersion;
}

export function subscribeToContentVersion(listener: Listener): () => void {
  listeners.add(listener);

  if (!timer) {
    timer = setInterval(() => {
      poll().catch(() => {
        // 吞掉单次查询错误（如 DB 抖动 / 旧库缺列）；下个 tick 重试，
        // 已建立的 SSE 连接保持不拆。
      });
    }, CHECK_INTERVAL_MS);
    // 不为轮询单独拖住进程退出。
    timer.unref?.();
  }

  // 新订阅者立即触发一次 poll，不用等满一个周期。
  poll().catch(() => {});

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      lastVersion = null;
    }
  };
}
