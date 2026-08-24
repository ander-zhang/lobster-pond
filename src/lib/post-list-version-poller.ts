import { getEnrichedPosts } from "./content.ts";
import { getPostListVersion } from "./post-list-state.ts";

const CHECK_INTERVAL_MS = 5000;

type Listener = (version: string) => void;

// Process-wide shared poller. Every SSE connection subscribes to the same
// interval and the same getEnrichedPosts() call, so N open browsers cost one
// poll per tick instead of N. Ref-counted: the interval starts on the first
// subscriber and stops when the last one leaves.
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastVersion: string | null = null;

async function poll() {
  const posts = await getEnrichedPosts();
  const version = getPostListVersion(posts);
  if (version === lastVersion) {
    return;
  }
  lastVersion = version;
  for (const listener of listeners) {
    listener(version);
  }
}

export function getLastVersion() {
  return lastVersion;
}

export function subscribeToPostListVersion(listener: Listener): () => void {
  listeners.add(listener);

  if (!timer) {
    timer = setInterval(() => {
      poll().catch(() => {
        // Swallow transient errors; the next tick retries. Individual streams
        // stay open rather than tearing down on one failed DB read.
      });
    }, CHECK_INTERVAL_MS);
    // Don't keep the process alive just for polling.
    timer.unref?.();
  }

  // Kick an immediate refresh so a fresh subscriber learns the current version
  // without waiting a full interval.
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
