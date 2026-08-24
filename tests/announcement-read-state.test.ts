// tests/announcement-read-state.test.ts
// 公告已读状态（localStorage id 集合）：标记单条/全部已读、未读计数、旧版单键迁移。
// Node 环境无 window/localStorage，用内存 Map  stub 后驱动真实实现。
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  ANNOUNCEMENTS_READ_CHANGED_EVENT,
  countUnreadAnnouncements,
  getReadAnnouncementIds,
  markAllAnnouncementsRead,
  markAnnouncementRead,
  migrateLegacyReadMarker,
} from "../src/lib/announcement-read-state";

const READ_IDS_KEY = "announcements-read-ids";
const LEGACY_READ_KEY = "announcements-last-read-id";

// run-tests.ts 在同一进程内串行导入全部测试文件，用例结束后撤掉 window stub，
// 避免影响后续文件里依赖 "typeof window === undefined" 判定 SSR 路径的代码。
after(() => {
  delete (globalThis as Record<string, unknown>).window;
});

type StorageStub = Map<string, string>;

// 每个用例前重置一份全新 localStorage stub；返回事件派发计数器。
function stubBrowserStorage(): { store: StorageStub; dispatched: () => number } {
  const store: StorageStub = new Map();
  let dispatchCount = 0;
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
    dispatchEvent: (event: Event) => {
      if (event.type === ANNOUNCEMENTS_READ_CHANGED_EVENT) dispatchCount += 1;
      return true;
    },
  };
  return { store, dispatched: () => dispatchCount };
}

describe("公告已读状态 announcement-read-state", () => {
  it("默认无已读记录，getReadAnnouncementIds 返回空集合", () => {
    stubBrowserStorage();
    assert.equal(getReadAnnouncementIds().size, 0);
  });

  it("markAnnouncementRead 写入并持久化，重复标记幂等且不再派发事件", () => {
    const { store, dispatched } = stubBrowserStorage();
    markAnnouncementRead("a");
    markAnnouncementRead("b");
    assert.deepEqual([...getReadAnnouncementIds()].sort(), ["a", "b"]);
    assert.equal(store.get(READ_IDS_KEY), JSON.stringify(["a", "b"]));
    assert.equal(dispatched(), 2);

    markAnnouncementRead("a");
    assert.equal(dispatched(), 2);
  });

  it("markAllAnnouncementsRead 合入全部 id，未读计数归零", () => {
    stubBrowserStorage();
    markAnnouncementRead("a");
    markAllAnnouncementsRead(["a", "b", "c"]);
    assert.equal(countUnreadAnnouncements([{ id: "a" }, { id: "b" }, { id: "c" }]), 0);
  });

  it("countUnreadAnnouncements 只统计未读条数", () => {
    stubBrowserStorage();
    markAnnouncementRead("b");
    assert.equal(countUnreadAnnouncements([{ id: "a" }, { id: "b" }, { id: "c" }]), 2);
  });

  it("旧版单键迁移：该 id 及更早公告（列表按 date 降序，其起至末尾）全部记为已读", () => {
    const { store } = stubBrowserStorage();
    store.set(LEGACY_READ_KEY, "b");
    const list = [{ id: "newest" }, { id: "b" }, { id: "older" }];
    migrateLegacyReadMarker(list);
    assert.deepEqual([...getReadAnnouncementIds()].sort(), ["b", "older"]);
    assert.equal(countUnreadAnnouncements(list), 1);
    assert.equal(store.get(LEGACY_READ_KEY), undefined);
  });

  it("旧 id 已不在列表内（过期）时兜底全部记已读；新键已存在则不动", () => {
    const { store } = stubBrowserStorage();
    store.set(LEGACY_READ_KEY, "expired");
    migrateLegacyReadMarker([{ id: "x" }, { id: "y" }]);
    assert.deepEqual([...getReadAnnouncementIds()].sort(), ["x", "y"]);

    // 新键已存在：旧键不再生效。
    store.set(LEGACY_READ_KEY, "x");
    markAnnouncementRead("z");
    migrateLegacyReadMarker([{ id: "w" }]);
    assert.ok(!getReadAnnouncementIds().has("w"));
  });

  it("已读记录损坏（非 JSON 数组）时按空集合处理", () => {
    const { store } = stubBrowserStorage();
    store.set(READ_IDS_KEY, "{broken");
    assert.equal(getReadAnnouncementIds().size, 0);
    store.set(READ_IDS_KEY, JSON.stringify({ not: "array" }));
    assert.equal(getReadAnnouncementIds().size, 0);
  });
});
