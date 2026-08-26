import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterLibraryDocs } from "../src/lib/library-list-state.ts";
import type { MarkdownDoc } from "../src/lib/types.ts";

const docs = [
  { id: "a", type: "knowledge", domain: "数据与算法", ownerBotIds: ["bot-1"], title: "数据与算法热失控排查", summary: "针刺实验流程" },
  { id: "b", type: "skills", scenario: "数据分析", ownerBotIds: ["bot-1", "bot-2"], title: "循环寿命预测", summary: "容量衰减模型" },
  { id: "c", type: "knowledge", domain: "运维与部署", ownerBotIds: [], title: "辐射整改案例", summary: "含数据与算法包屏蔽方案" },
].map((doc) => doc as unknown as MarkdownDoc);

describe("filterLibraryDocs", () => {
  it("全部条件返回所有文档", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "all" }).map((doc) => doc.id), ["a", "b", "c"]));
  it("按领域筛选（知识匹配 domain）", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "数据与算法", botId: "all" }).map((doc) => doc.id), ["a"]));
  it("按场景筛选（技能匹配 scenario）", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "数据分析", botId: "all" }).map((doc) => doc.id), ["b"]));
  it("按虾筛选，多虾归属可命中", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "bot-2" }).map((doc) => doc.id), ["b"]));
  it("未归属文档不匹配具体虾", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "bot-1" }).map((doc) => doc.id), ["a", "b"]));
  it("关键词匹配标题", () => assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "all", query: "热失控" }).map((doc) => doc.id), ["a"]));
  it("关键词匹配 ID 与摘要，大小写不敏感", () => {
    assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "all", query: "B" }).map((doc) => doc.id), ["b"]);
    assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "all", query: "屏蔽" }).map((doc) => doc.id), ["c"]);
  });
  it("关键词与其他条件叠加，空白关键词不过滤", () => {
    assert.deepEqual(filterLibraryDocs(docs, { domain: "数据与算法", botId: "all", query: "数据与算法" }).map((doc) => doc.id), ["a"]);
    assert.deepEqual(filterLibraryDocs(docs, { domain: "all", botId: "all", query: "  " }).map((doc) => doc.id), ["a", "b", "c"]);
  });
});

describe("filterLibraryDocs 种别 / 类型筛选", () => {
  const docs = [
    { id: "a", type: "knowledge", title: "A", summary: "", domain: "运维与部署", category: "标准", subtype: "编码标准", ownerBotIds: [] },
    { id: "b", type: "knowledge", title: "B", summary: "", domain: "运维与部署", category: "方法", subtype: "竞品调研报告", ownerBotIds: [] },
    { id: "c", type: "knowledge", title: "C", summary: "", domain: "运维与部署", category: "标准", subtype: "接口标准", ownerBotIds: [] },
  ] as never[];

  it("按种别过滤", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", category: "标准" });
    assert.deepEqual(out.map((d: { id: string }) => d.id), ["a", "c"]);
  });

  it("按类型过滤", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", category: "标准", subtype: "编码标准" });
    assert.deepEqual(out.map((d: { id: string }) => d.id), ["a"]);
  });

  it("category=all 不过滤", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", category: "all" });
    assert.equal(out.length, 3);
  });
});

describe("filterLibraryDocs 日期筛选", () => {
  // createdAt 为 timestamptz（取 UTC 正午，平台时区 Asia/Shanghai 归桶不跨日）；
  // 无 createdAt 的回退 updatedAt（YYYY-MM-DD 文本，与审核治理队列同源）。
  const docs = [
    { id: "a", type: "knowledge", title: "A", summary: "", domain: "运维与部署", ownerBotIds: [], createdAt: "2026-08-05T12:00:00Z" },
    { id: "b", type: "knowledge", title: "B", summary: "", domain: "运维与部署", ownerBotIds: [], createdAt: "2026-08-20T12:00:00Z" },
    { id: "c", type: "knowledge", title: "C", summary: "", domain: "运维与部署", ownerBotIds: [], updatedAt: "2026-07-15" },
  ] as never[];

  it("dateFrom 只保留起始日及之后的文档", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", dateFrom: "2026-08-01" });
    assert.deepEqual(out.map((d: { id: string }) => d.id), ["a", "b"]);
  });

  it("dateTo 只保留截止日及之前的文档", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", dateTo: "2026-08-10" });
    assert.deepEqual(out.map((d: { id: string }) => d.id), ["a", "c"]);
  });

  it("起止同时给定为闭区间", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all", dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    assert.deepEqual(out.map((d: { id: string }) => d.id), ["a", "b"]);
  });

  it("缺省不过滤", () => {
    const out = filterLibraryDocs(docs, { domain: "all", botId: "all" });
    assert.equal(out.length, 3);
  });
});
