import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, formatDateOnly, formatDateTime, scenarioLabel } from "../src/lib/format.ts";

describe("formatDateTime（年/月/日 时:分，平台时区 Asia/Shanghai）", () => {
  it("null / 缺失 → 待确认", () => {
    assert.equal(formatDateTime(null), "待确认");
  });

  it("UTC 时间戳按北京时间落本地时刻，含年份", () => {
    // 2026-08-18 07:54:22 UTC = 2026-08-18 15:54 北京。
    assert.equal(formatDateTime("2026-08-18T07:54:22.657Z"), "2026/08/18 15:54");
  });

  it("跨日：UTC 次日零点附近仍按北京时区正确归属", () => {
    // 2026-08-18 16:30:00 UTC = 2026-08-19 00:30 北京。
    assert.equal(formatDateTime("2026-08-18T16:30:00.000Z"), "2026/08/19 00:30");
  });

  it("非法值原样透传，不强行转换", () => {
    assert.equal(formatDateTime("not-a-date"), "not-a-date");
  });

  it("与 formatDate（无年份）/ formatDateOnly（无时分）互补", () => {
    // 同一时刻：formatDateTime 含年份含时分；formatDate 无年份；formatDateOnly 无时分。
    const ts = "2026-08-18T07:54:22.657Z";
    assert.equal(formatDateTime(ts), "2026/08/18 15:54");
    assert.equal(formatDateOnly(ts), "2026/08/18");
    // formatDate 不含年份（仅 月/日 时:分），确认二者形态不同。
    assert.ok(!/\d{4}/.test(formatDate(ts)));
  });
});

describe("scenarioLabel（场景徽标文案，无配色）", () => {
  it("中文场景值原样返回", () => {
    assert.equal(scenarioLabel("编程开发"), "编程开发");
    assert.equal(scenarioLabel("办公协同"), "办公协同");
  });
  it("null / 缺失 → 空串（徽标不渲染兜底）", () => {
    assert.equal(scenarioLabel(null), "");
    assert.equal(scenarioLabel(""), "");
  });
});
