// 公告已读状态（客户端 localStorage）：按公告 id 集合持久化，页眉公告入口
//（AnnouncementsDialog）与总览页公告横幅（SiteAnnouncement）共享同一份状态；
// 每次写入后派发 announcements-read-changed 事件，监听方据此刷新未读计数与按钮样式。
// 与横幅的"关闭"（announcement-dismissed-*）语义独立：取消横幅不视为已读。
// 兼容旧版单键 announcements-last-read-id（只记"最近已读公告 id"），见迁移函数。

const READ_IDS_KEY = "announcements-read-ids";
const LEGACY_READ_KEY = "announcements-last-read-id";

export const ANNOUNCEMENTS_READ_CHANGED_EVENT = "announcements-read-changed";

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function getReadAnnouncementIds(): Set<string> {
  const store = storage();
  if (!store) return new Set();
  try {
    const raw = store.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  const store = storage();
  if (!store) return;
  store.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(ANNOUNCEMENTS_READ_CHANGED_EVENT));
}

// 标记单条已读：幂等，已读再调不重复写盘 / 派发事件。
export function markAnnouncementRead(id: string): void {
  const ids = getReadAnnouncementIds();
  if (ids.has(id)) return;
  ids.add(id);
  saveReadIds(ids);
}

export function markAllAnnouncementsRead(allIds: string[]): void {
  const ids = getReadAnnouncementIds();
  for (const id of allIds) {
    ids.add(id);
  }
  saveReadIds(ids);
}

export function countUnreadAnnouncements(list: { id: string }[]): number {
  const ids = getReadAnnouncementIds();
  return list.filter((announcement) => !ids.has(announcement.id)).length;
}

// 旧版迁移：旧键存在且新键不存在时，把"最近已读公告 id"及其更早的公告全部视为已读
//（列表按 date 降序，该 id 起至末尾即更早的公告；id 已过期不在列表内则全部兜底已读），
// 随后删除旧键。新键已存在（已迁移过 / 新版已写过）则不动。
export function migrateLegacyReadMarker(list: { id: string }[]): void {
  const store = storage();
  if (!store) return;
  if (store.getItem(READ_IDS_KEY) !== null) return;
  const legacy = store.getItem(LEGACY_READ_KEY);
  if (!legacy) return;
  const index = list.findIndex((announcement) => announcement.id === legacy);
  const seed = index === -1 ? list.map((a) => a.id) : list.slice(index).map((a) => a.id);
  store.setItem(READ_IDS_KEY, JSON.stringify(seed));
  store.removeItem(LEGACY_READ_KEY);
}
