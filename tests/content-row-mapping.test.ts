import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rowToPost, rowToDoc, normalizeBotSummary, type PostRow, type RefRow } from "../src/lib/content.ts";

const baseRow: PostRow = {
  id: "pkt-1",
  title: "重复升级",
  summary: "同一问题在多个渠道重复升级。",
  bot_id: "relay-ops",
  im_platform: "Slack",
  domain: "incident",
  status: "resolved",
  created_at: "2026-06-09T09:20:00+08:00",
  resolved_at: "2026-06-09T10:05:00+08:00",
  fields: { owner: "支付可靠性小组" },
  timeline: [{ time: "10:05", label: "解决", detail: "路由规则已修补。" }],
};

const refs: RefRow[] = [
  { post_id: "pkt-1", doc_id: "routing", doc_type: "knowledge" },
  { post_id: "pkt-1", doc_id: "triage", doc_type: "skills" },
];

describe("normalizeBotSummary（虾简介超长规整为空）", () => {
  it("超过 20 字规整为空串", () => {
    assert.equal(normalizeBotSummary("这是一段超过二十个字的虾简介用来验证长度上限是否生效"), "");
  });

  it("恰好 20 字原样保留", () => {
    const s = "字".repeat(20);
    assert.equal(normalizeBotSummary(s), s);
  });

  it("空串与 20 字内的简介原样保留", () => {
    assert.equal(normalizeBotSummary(""), "");
    assert.equal(normalizeBotSummary("负责故障分诊"), "负责故障分诊");
  });
});

describe("rowToPost mapping", () => {
  it("maps snake_case columns to camelCase post fields", () => {
    const post = rowToPost(baseRow, refs);
    assert.equal(post.botId, "relay-ops");
    assert.equal(post.imPlatform, "Slack");
    assert.equal(post.resolvedAt, "2026-06-09T10:05:00+08:00");
  });

  it("splits doc refs into knowledge and skill ref ids", () => {
    const post = rowToPost(baseRow, refs);
    assert.deepEqual(post.knowledgeRefs, ["routing"]);
    assert.deepEqual(post.skillRefs, ["triage"]);
  });

  it("parses fields and timeline from JSON strings (Postgres jsonb-as-text)", () => {
    const post = rowToPost(
      { ...baseRow, fields: JSON.stringify({ impact: "11 个商户" }), timeline: JSON.stringify([{ time: "10:05", label: "解决", detail: "已修补。" }]) },
      [],
    );
    assert.deepEqual(post.fields, { impact: "11 个商户" });
    assert.equal(post.timeline.length, 1);
    assert.equal(post.timeline[0].label, "解决");
  });

  it("does not throw on malformed fields/timeline JSON, returns safe defaults", () => {
    const post = rowToPost({ ...baseRow, fields: "{not json", timeline: "also broken" }, []);
    assert.deepEqual(post.fields, {});
    assert.deepEqual(post.timeline, []);
  });

  it("treats a JSON array in the fields column as an empty record", () => {
    const post = rowToPost({ ...baseRow, fields: "[1,2,3]" }, []);
    assert.deepEqual(post.fields, {});
  });

  it("maps author_user_id to authorUserId (null when absent)", () => {
    const withAuthor = rowToPost({ ...baseRow, author_user_id: "user-1" }, refs);
    assert.equal(withAuthor.authorUserId, "user-1");

    const withoutAuthor = rowToPost({ ...baseRow }, refs);
    assert.equal(withoutAuthor.authorUserId, null);
  });

  it("maps null bot_id to null botId", () => {
    const post = rowToPost({ ...baseRow, bot_id: null }, refs);
    assert.equal(post.botId, null);
  });

  it("maps monitoring_entered_at to monitoringEnteredAt (null when absent)", () => {
    const withEntered = rowToPost({ ...baseRow, monitoring_entered_at: "2026-08-06T10:00:00+08:00" }, refs);
    assert.equal(withEntered.monitoringEnteredAt, "2026-08-06T10:00:00+08:00");

    const withoutEntered = rowToPost({ ...baseRow }, refs);
    assert.equal(withoutEntered.monitoringEnteredAt, null);
  });

  it("maps parent_reply_id and reply mentions for a threaded reply", () => {
    const post = rowToPost(baseRow, [], [{
      id: "reply-child", post_id: "pkt-1", parent_reply_id: "reply-parent", author_type: "human",
      author_name: "张三", author_bot_id: null, author_user_id: "user-1", content: "跟进", created_at: "2026-07-26T00:00:00.000Z",
    }], new Map(), new Map(), new Map([["reply-child", [{ targetType: "user", targetId: "user-2", name: "李四" }]]]));
    assert.equal(post.replies[0].parentReplyId, "reply-parent");
    assert.deepEqual(post.replies[0].mentionRefs, [{ targetType: "user", targetId: "user-2", name: "李四" }]);
  });
});

describe("rowToDoc category / subtype", () => {
  it("带 category / subtype 列时原样映射", () => {
    const doc = rowToDoc({
      id: "ops-deployment-standard-coding-standard-001",
      doc_type: "knowledge",
      title: "标题",
      tags: [],
      domain: "运维与部署",
      updated_at: "2026-08-17",
      owner_bot_ids: [],
      summary: "摘要",
      body: "正文",
      category: "标准",
      subtype: "编码标准",
    } as never) as { category: string; subtype: string | null };
    assert.equal(doc.category, "标准");
    assert.equal(doc.subtype, "编码标准");
  });

  it("缺 category 列回退经验、subtype null", () => {
    const doc = rowToDoc({
      id: "legacy-1",
      doc_type: "knowledge",
      title: "旧文档",
      tags: [],
      domain: "运维与部署",
      updated_at: "2026-08-17",
      owner_bot_ids: [],
      summary: "摘要",
      body: "正文",
    } as never) as { category: string; subtype: string | null };
    assert.equal(doc.category, "经验");
    assert.equal(doc.subtype, null);
  });
});

describe("rowToDoc scenario（技能）", () => {
  it("技能行带 scenario 列映射为 SkillDoc（scenario 原样，type=skills）", () => {
    const doc = rowToDoc({
      id: "oa-canteen",
      doc_type: "skills",
      title: "食堂查询",
      tags: [],
      domain: null,
      updated_at: "2026-08-17",
      owner_bot_ids: [],
      summary: "摘要",
      body: "正文",
      scenario: "办公协同",
    } as never) as { type: string; scenario: string };
    assert.equal(doc.type, "skills");
    assert.equal(doc.scenario, "办公协同");
  });

  it("技能行缺 scenario 列回退其他", () => {
    const doc = rowToDoc({
      id: "legacy-skill",
      doc_type: "skills",
      title: "旧技能",
      tags: [],
      domain: null,
      updated_at: "2026-08-17",
      owner_bot_ids: [],
      summary: "摘要",
      body: "正文",
    } as never) as { type: string; scenario: string };
    assert.equal(doc.type, "skills");
    assert.equal(doc.scenario, "其他");
  });
});
