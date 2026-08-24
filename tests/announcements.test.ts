// tests/announcements.test.ts
// 网站公告解析：仓库内 announcements/*.md 的 frontmatter + 正文解析与校验边界。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterAnnouncementsWithinLastMonth, parseAnnouncement, type Announcement } from "../src/lib/announcements";

describe("网站公告解析 parseAnnouncement", () => {
  it("解析完整 frontmatter（id/title/date）与正文", () => {
    const parsed = parseAnnouncement(
      "---\nid: welcome-2026-08\ntitle: 欢迎使用\ndate: 2026-08-14\n---\n\n这是公告正文。\n",
    );
    assert.ok(parsed);
    assert.equal(parsed.id, "welcome-2026-08");
    assert.equal(parsed.title, "欢迎使用");
    assert.equal(parsed.date, "2026-08-14");
    assert.equal(parsed.body, "这是公告正文。");
  });

  it("date 可选：缺省时为 null", () => {
    const parsed = parseAnnouncement("---\nid: a\ntitle: b\n---\n正文");
    assert.ok(parsed);
    assert.equal(parsed.date, null);
  });

  it("缺失 frontmatter 返回 null", () => {
    assert.equal(parseAnnouncement("没有 frontmatter 的正文"), null);
  });

  it("缺失 id / title / 正文任一必填字段返回 null", () => {
    assert.equal(parseAnnouncement("---\ntitle: b\n---\n正文"), null);
    assert.equal(parseAnnouncement("---\nid: a\n---\n正文"), null);
    assert.equal(parseAnnouncement("---\nid: a\ntitle: b\n---\n"), null);
  });

  it("frontmatter 非法 YAML 返回 null", () => {
    assert.equal(parseAnnouncement("---\nid: [未闭合\n---\n正文"), null);
  });
});

describe("近一个月公告过滤 filterAnnouncementsWithinLastMonth", () => {
  function make(id: string, date: string | null): Announcement {
    return { id, title: id, body: "正文", date };
  }

  // 参考日期 2026-08-14：向前推一个自然月，区间为 [2026-07-14, 2026-08-14]（含边界）。
  const reference = new Date(2026, 7, 14);

  it("保留区间内公告，剔除早于截止日 / 晚于参考日 / 无 date 的", () => {
    const list = [
      make("today", "2026-08-14"),
      make("cutoff", "2026-07-14"),
      make("inside", "2026-08-01"),
      make("too-old", "2026-07-13"),
      make("future", "2026-08-15"),
      make("undated", null),
    ];
    const kept = filterAnnouncementsWithinLastMonth(list, reference).map((a) => a.id);
    assert.deepEqual(kept, ["today", "cutoff", "inside"]);
  });

  it("跨月按自然月回推（3 月 31 日 → 截止 2 月 28/29 日由 setMonth 兜底）", () => {
    // new Date(2026, 1, 31) 会溢出到 3 月，这里直接用 setMonth 的等价语义验证：
    // 参考 2026-03-31，cutoff = 2026-02-31 → 归一为 2026-03-03（JS Date 行为）。
    const list = [make("m0303", "2026-03-03"), make("m0302", "2026-03-02")];
    const kept = filterAnnouncementsWithinLastMonth(list, new Date(2026, 2, 31)).map((a) => a.id);
    assert.deepEqual(kept, ["m0303"]);
  });

  it("空列表返回空数组", () => {
    assert.deepEqual(filterAnnouncementsWithinLastMonth([], reference), []);
  });
});

describe("页眉公告入口未读气泡与时间线弹窗 AnnouncementsDialog", () => {
  it("挂载即拉取公告，气泡显示具体未读条数", async () => {
    const { readFile } = await import("node:fs/promises");
    const component = await readFile(new URL("../src/components/AnnouncementsDialog.tsx", import.meta.url), "utf8");

    // 已读状态走共享模块的 id 集合（localStorage），挂载即拉取并做未读计数。
    assert.match(component, /announcement-read-state/);
    assert.match(component, /useEffect/);
    assert.match(component, /getReadAnnouncementIds/);
    // 气泡展示具体未读条数（超 99 显示 99+），不再是无内容的小红点。
    assert.match(component, /unreadCount > 99 \? "99\+" : unreadCount/);
    assert.match(component, /bg-\[var\(--rose-strong\)\]/);
  });

  it("时间线弹窗：逐条圆形对勾按钮（白底灰勾→绿底白勾）+ 全部已读按钮", async () => {
    const { readFile } = await import("node:fs/promises");
    const component = await readFile(new URL("../src/components/AnnouncementsDialog.tsx", import.meta.url), "utf8");

    // 圆形对勾按钮：未读白底灰勾、已读绿底白勾，aria-pressed 反映状态；已读单向锁定。
    assert.match(component, /aria-pressed=\{read\}/);
    assert.match(component, /bg-\[var\(--accent-strong\)\] text-white/);
    assert.match(component, /markAnnouncementRead\(announcement\.id\)/);
    // 连接线颜色跟随下一条已读状态；「全部已读」按钮调用批量标记。
    assert.match(component, /w-\[1\.5px\] grow/);
    assert.match(component, /markAllAnnouncementsRead/);
    assert.match(component, /全部已读/);
    // 打开弹窗不再自动记已读（已读只能由对勾按钮 / 全部已读 / 横幅点击触发）。
    assert.doesNotMatch(component, /handleOpen/);
  });

  it("横幅点击最新公告标题记该条已读，取消横幅不记已读", async () => {
    const { readFile } = await import("node:fs/promises");
    const component = await readFile(new URL("../src/components/SiteAnnouncement.tsx", import.meta.url), "utf8");

    assert.match(component, /markAnnouncementRead\(announcement\.id\)/);
    // dismiss 只写"关闭"标记，不得触碰已读状态。
    const dismiss = component.match(/function dismiss\(\) \{[\s\S]*?\n  \}/);
    assert.ok(dismiss);
    assert.doesNotMatch(dismiss[0], /markAnnouncementRead|markAllAnnouncementsRead/);
  });
});
