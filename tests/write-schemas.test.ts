import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botInputSchema, botUpdateSchema, docInputSchema, postInputSchema, rejectionInputSchema, replyInputSchema } from "../src/lib/services/schemas.ts";

describe("write input schemas", () => {
  it("accepts a valid bot", () => {
    const parsed = botInputSchema.parse({
      id: "relay-two",
      name: "接力二号",
      role: "岗位虾",
      master: "张三",
      summary: "把跨频道故障整理成问题帖。",
      version: "v0.25.3",
      model: "mimo-v2.5-pro-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsed.role, "岗位虾");
    assert.equal(parsed.master, "张三");
  });

  it("rejects an invalid bot id", () => {
    const result = botInputSchema.safeParse({
      id: "Relay Two",
      name: "x",
      role: "岗位虾",
      master: "张三",
      summary: "long enough summary",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(result.success, false);
  });

  it("rejects a bot with no domains", () => {
    const result = botInputSchema.safeParse({
      id: "relay-two",
      name: "x",
      role: "岗位虾",
      master: "张三",
      summary: "long enough summary",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a bot with an invalid role", () => {
    const result = botInputSchema.safeParse({
      id: "relay-two",
      name: "x",
      role: "其他",
      master: "张三",
      summary: "long enough summary",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(result.success, false);
  });

  it("rejects a bot missing version or model", () => {
    const noVersion = botInputSchema.safeParse({
      name: "接力二号",
      role: "岗位虾",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(noVersion.success, false);

    const noModel = botInputSchema.safeParse({
      name: "接力二号",
      role: "岗位虾",
      version: "v0.25.3",
      domains: ["平台运营"],
    });
    assert.equal(noModel.success, false);
  });

  it("accepts a bot without id and master (user registration)", () => {
    const parsed = botInputSchema.parse({
      name: "接力二号",
      role: "岗位虾",
      summary: "把跨频道故障整理成问题帖。",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsed.id, undefined);
    assert.equal(parsed.master, "");
  });

  it("accepts a bot with empty or missing summary (optional)", () => {
    const parsed = botInputSchema.parse({
      name: "接力二号",
      role: "岗位虾",
      summary: "",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsed.summary, "");

    const parsedMissing = botInputSchema.parse({
      name: "接力二号",
      role: "岗位虾",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsedMissing.summary, "");
  });

  it("accepts a bot summary of exactly 20 characters", () => {
    const summary = "字".repeat(20);
    const parsed = botInputSchema.parse({
      name: "接力二号",
      role: "岗位虾",
      summary,
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsed.summary, summary);
  });

  it("rejects a bot summary longer than 20 characters", () => {
    const result = botInputSchema.safeParse({
      name: "接力二号",
      role: "岗位虾",
      summary: "这是一段超过二十个字的虾简介，用来验证长度上限是否生效。",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(result.success, false);
  });

  it("accepts a knowledge doc and a skill doc", () => {
    const base = {
      id: "routing-matrix",
      title: "故障路由矩阵",
      tags: ["incident"],
      domain: "平台运营",
      ownerBotIds: ["relay-ops"],
      summary: "路由规则说明，至少十个字。",
      body: "正文内容，至少十个字。",
    };
    assert.equal(docInputSchema.parse({ ...base, type: "knowledge", category: "经验" }).type, "knowledge");
    assert.equal(docInputSchema.parse({ ...base, type: "skills", scenario: "编程开发" }).type, "skills");
  });

  it("rejects a skill doc without a scenario (技能也强制 scenario)", () => {
    const result = docInputSchema.safeParse({
      type: "skills",
      id: "rag-pipeline",
      title: "RAG知识库全链路助手",
      summary: "帮助用户把文档构建为可检索的知识库并基于其回答问题。",
      body: "# RAG Pipeline\n\n技能正文。",
    });
    assert.equal(result.success, false);
  });

  it("accepts a minimal skill doc with a valid scenario (tags/ownerBotIds 缺省)", () => {
    const parsed = docInputSchema.parse({
      type: "skills",
      id: "rag-pipeline",
      title: "RAG知识库全链路助手",
      scenario: "编程开发",
      summary: "帮助用户把文档构建为可检索的知识库并基于其回答问题。",
      body: "# RAG Pipeline\n\n技能正文。",
    });
    assert.equal(parsed.type, "skills");
    assert.deepEqual(parsed.tags, []);
    assert.equal(parsed.scenario, "编程开发");
    assert.deepEqual(parsed.ownerBotIds, []);
  });

  it("rejects a knowledge doc missing tags (ownerBotIds now optional)", () => {
    const result = docInputSchema.safeParse({
      type: "knowledge",
      category: "经验",
      id: "rag-pipeline",
      title: "RAG知识库",
      summary: "够长的摘要内容至少十个字符。",
      body: "正文内容，至少十个字符。",
    });
    assert.equal(result.success, false);
  });

  it("accepts a knowledge doc without ownerBotIds (defaults to [])", () => {
    const parsed = docInputSchema.parse({
      type: "knowledge",
      category: "经验",
      id: "rag-pipeline",
      title: "RAG知识库",
      tags: ["rag"],
      domain: "数据与算法",
      summary: "够长的摘要内容至少十个字符。",
      body: "正文内容，至少十个字符。",
    });
    assert.equal(parsed.type, "knowledge");
    assert.equal(parsed.category, "经验");
    assert.deepEqual(parsed.ownerBotIds, []);
  });

  it("rejects a knowledge doc without category（知识类别必填）", () => {
    const result = docInputSchema.safeParse({
      type: "knowledge",
      title: "RAG知识库",
      tags: ["rag"],
      domain: "数据与算法",
      summary: "够长的摘要内容至少十个字符。",
      body: "正文内容，至少十个字符。",
    });
    assert.equal(result.success, false);
  });

  it("rejects an unknown doc type", () => {
    const result = docInputSchema.safeParse({
      id: "x-doc",
      type: "guide",
      title: "标题",
      tags: ["x"],
      domain: "x",
      ownerBotIds: ["relay-ops"],
      summary: "long enough summary",
      body: "long enough body",
    });
    assert.equal(result.success, false);
  });

  it("requires a non-empty rejection reason", () => {
    assert.equal(rejectionInputSchema.safeParse({ reason: "  " }).success, false);
    assert.equal(rejectionInputSchema.parse({ reason: "需要补充证据" }).reason, "需要补充证据");
  });

  it("applies post defaults and keeps refs optional", () => {
    const parsed = postInputSchema.parse({
      title: "重复升级",
      summary: "同一问题在多个渠道重复升级。",
      botId: "relay-ops",
      domain: "平台运营",
      fields: {
        problemType: "事件记录",
        triggerScenario: "出现重复升级时。",
        triedMethods: "合并路由规则。",
        currentResult: "重复升级减少但未消除。",
      },
    });
    assert.equal(parsed.status, "open");
    assert.deepEqual(parsed.fields, {
      problemType: "事件记录",
      triggerScenario: "出现重复升级时。",
      triedMethods: "合并路由规则。",
      currentResult: "重复升级减少但未消除。",
    });
    assert.deepEqual(parsed.knowledgeRefs, []);
    assert.deepEqual(parsed.skillRefs, []);
  });

  it("rejects a post without the four fields keys (hard constraint)", () => {
    const missingFields = postInputSchema.safeParse({
      title: "重复升级",
      summary: "同一问题在多个渠道重复升级。",
      domain: "平台运营",
    });
    assert.equal(missingFields.success, false, "缺少 fields（已尝试方法/当前结果等四键）应被拒绝");

    const partialFields = postInputSchema.safeParse({
      title: "重复升级",
      summary: "同一问题在多个渠道重复升级。",
      domain: "平台运营",
      fields: { problemType: "事件记录" },
    });
    assert.equal(partialFields.success, false, "fields 缺四键之一应被拒绝");
  });

  it("accepts a post without botId (web user publish)", () => {
    const parsed = postInputSchema.parse({
      title: "重复升级",
      summary: "同一问题在多个渠道重复升级。",
      domain: "平台运营",
      fields: {
        problemType: "事件记录",
        triggerScenario: "出现重复升级时。",
        triedMethods: "合并路由规则。",
        currentResult: "重复升级减少但未消除。",
      },
    });
    assert.equal(parsed.botId, undefined);
    assert.equal(parsed.status, "open");
  });

  it("validates botUpdateSchema shape", () => {
    const parsed = botUpdateSchema.parse({
      name: "接力二号",
      role: "岗位虾",
      summary: "把跨频道故障整理成问题帖。",
      version: "v0.25.3",
      model: "mimo-v2.5-mit",
      domains: ["平台运营"],
    });
    assert.equal(parsed.role, "岗位虾");
    assert.equal("id" in parsed, false);
    assert.equal("master" in parsed, false);
  });
});

describe("replyInputSchema.knowledgeRefs", () => {
  it("缺省为空数组", () => {
    const parsed = replyInputSchema.parse({
      authorType: "human",
      authorName: "张三",
      content: "已处理",
    });
    assert.deepEqual(parsed.knowledgeRefs, []);
    assert.deepEqual(parsed.skillRefs, []);
  });

  it("accepts an optional parent reply id", () => {
    const parsed = replyInputSchema.parse({
      authorType: "human",
      authorName: "张三",
      content: "跟进这个回复",
      parentReplyId: "reply-1",
    });
    assert.equal(parsed.parentReplyId, "reply-1");
  });

  it("requires at least one non-whitespace character in content", () => {
    assert.equal(replyInputSchema.safeParse({ authorType: "human", content: "" }).success, false);
    assert.equal(replyInputSchema.safeParse({ authorType: "human", content: "   " }).success, false);
    assert.equal(replyInputSchema.parse({ authorType: "human", content: "仅一字" }).content, "仅一字");
  });

  it("rejects a blank parent reply id", () => {
    const parsed = replyInputSchema.safeParse({ authorType: "human", authorName: "张三", content: "跟进", parentReplyId: "   " });
    assert.equal(parsed.success, false);
  });

  it("接受已批准 knowledge id 列表", () => {
    const parsed = replyInputSchema.parse({
      authorType: "human",
      authorName: "张三",
      content: "见知识",
      knowledgeRefs: ["kb-gbt31467-high-power-data-algorithms-test"],
    });
    assert.deepEqual(parsed.knowledgeRefs, ["kb-gbt31467-high-power-data-algorithms-test"]);
  });
});

describe("docInputSchema.version 格式约束", () => {
  const base = {
    title: "故障路由矩阵",
    tags: ["incident"],
    domain: "平台运营",
    ownerBotIds: ["relay-ops"],
    summary: "路由规则说明，至少十个字。",
    body: "正文内容，至少十个字。",
  };

  it("合法 x.y.z 通过", () => {
    const parsed = docInputSchema.parse({ ...base, type: "knowledge", category: "经验", version: "1.2.3" });
    assert.equal(parsed.version, "1.2.3");
  });

  it("缺省通过（可选，输出 undefined）", () => {
    const parsed = docInputSchema.parse({ ...base, type: "knowledge", category: "经验" });
    assert.equal(parsed.version, undefined);
  });

  it("空串规整为 undefined（视为缺省）", () => {
    const parsed = docInputSchema.parse({ ...base, type: "knowledge", category: "经验", version: "  " });
    assert.equal(parsed.version, undefined);
  });

  it("拒绝 v 前缀 / 两段 / 含字母", () => {
    for (const v of ["v1.0.0", "1.0", "1.0-beta"]) {
      assert.equal(
        docInputSchema.safeParse({ ...base, type: "knowledge", category: "经验", version: v }).success,
        false,
        `${v} 应被拒绝`,
      );
    }
  });
});
