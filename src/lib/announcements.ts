import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { parse as parseYaml } from "yaml";

// 网站公告：仓库内 `announcements/*.md`，frontmatter 提供 id/title（可选 date 用于排序），
// 正文为 markdown。总览页把最新一条渲染为横幅——仅登录用户可见，点击弹详情，
// 点击「取消」后按浏览器（localStorage）持久隐藏。
export type Announcement = {
  id: string;
  title: string;
  body: string;
  date: string | null;
};

const rootDir = process.cwd();
const announcementsDir = path.join(rootDir, "announcements");

// 从单个公告 markdown 解析出 { id, title, body, date }；缺少 frontmatter 或必填字段返回 null。
// 纯函数（不碰文件系统），便于单测覆盖解析与校验边界。
export function parseAnnouncement(raw: string): Announcement | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return null;
  }

  let parsed: unknown;
  try {
    // failsafe schema 保证标量一律按字符串读取（date 如 2026-08-14 不被解析成 Date）。
    parsed = parseYaml(match[1], { schema: "failsafe" });
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const meta = parsed as Record<string, unknown>;

  const id = typeof meta.id === "string" ? meta.id.trim() : "";
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  const body = match[2].trim();
  if (!id || !title || !body) {
    return null;
  }
  const date = typeof meta.date === "string" ? meta.date.trim() : null;
  return { id, title, body, date };
}

// 读取全部公告，按 date 降序（无 date 的排在末尾）。React cache 避免多次请求重复读盘。
export const getAnnouncements = cache(function getAnnouncements(): Announcement[] {
  if (!fs.existsSync(announcementsDir)) {
    return [];
  }
  return fs
    .readdirSync(announcementsDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parseAnnouncement(fs.readFileSync(path.join(announcementsDir, file), "utf8")))
    .filter((announcement): announcement is Announcement => announcement !== null)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
});

// 当前生效公告：date 最新的一条；无任何有效公告返回 null（总览页不渲染横幅）。
export function getActiveAnnouncement(): Announcement | null {
  return getAnnouncements()[0] ?? null;
}

function toDateStr(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// 近一个月公告（页眉公告弹窗用）：以 referenceDate 为终点向前推一个自然月（含起止边界），
// 仅保留有 date 且落在区间内的；无 date 的无法判定时效，不纳入。date 为 YYYY-MM-DD，
// 字典序即时间序，可直接字符串比较。纯函数（referenceDate 由调用方注入），便于单测边界。
export function filterAnnouncementsWithinLastMonth(
  list: Announcement[],
  referenceDate: Date,
): Announcement[] {
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - 1);
  const lo = toDateStr(cutoff);
  const hi = toDateStr(referenceDate);
  return list.filter((a) => a.date !== null && a.date >= lo && a.date <= hi);
}
