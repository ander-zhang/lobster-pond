import test from "node:test";
import assert from "node:assert/strict";
import { isolationEnabled, publicAccountNames, postVisibleTo, docVisibleTo, botVisibleTo, replyVisibleTo, commentVisibleTo } from "../src/lib/visibility.ts";
import type { Bot, MarkdownDoc, Post, PostReply } from "../src/lib/types.ts";

const DEMO = "u-demo";
const ALICE = "u-alice";

const ctxOn = { isolated: true, publicUserIds: new Set([DEMO]) };
const ctxOff = { isolated: false, publicUserIds: new Set<string>() };

const bot = (ownerUserId: string | null): Bot => ({
  id: "b1", name: "虾一", role: "岗位虾", master: "", summary: "", domains: ["运维与部署"],
  version: "1.0", model: "m", ownerUserId, createdAt: new Date().toISOString(),
});

const post = (over: Partial<Post> = {}): Post => ({
  id: "p1", title: "t", summary: "s", botId: null, imPlatform: "未指定", domain: "其他",
  status: "open", createdAt: new Date().toISOString(), resolvedAt: null,
  knowledgeRefs: [], skillRefs: [], fields: { problemType: "a", triggerScenario: "b", triedMethods: "c", currentResult: "d" },
  timeline: [], replies: [], reviewedAt: null, reviewer: null, authorUserId: null, ...over,
});

// 注：MarkdownDoc 为 KnowledgeDoc | SkillDoc 联合，knowledge 分支必须带 domain/category/subtype
// （types.ts 一致性修正，断言语义不变）。
const doc = (over: Partial<MarkdownDoc> = {}): MarkdownDoc => ({
  id: "d1", type: "knowledge", title: "t", tags: [], updatedAt: "2026-08-24", ownerBotIds: [],
  summary: "s", body: "b", contentState: "Approved", version: "1.0.0", evidence: null,
  authorUserId: null, domain: "其他", category: "经验", subtype: null, ...over,
} as MarkdownDoc);

const reply = (over: Partial<PostReply> = {}): PostReply => ({
  id: "r1", postId: "p1", content: "c", authorType: "human", authorName: "n",
  createdAt: new Date().toISOString(), attachments: [], knowledgeRefs: [], skillRefs: [],
  mentionRefs: [], parentReplyId: null, authorUserId: null, authorBotId: null, ...over,
} as PostReply);

test("isolationEnabled：默认 true，仅显式 false/0 关闭，非法值 fail-safe 为隔离", () => {
  assert.equal(isolationEnabled({}), true);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "false" }), false);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "0" }), false);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "true" }), true);
  assert.equal(isolationEnabled({ DEMO_ISOLATION: "随便" }), true);
});

test("publicAccountNames：默认 用户1,用户2，逗号分隔去空白", () => {
  assert.deepEqual(publicAccountNames({}), ["用户1", "用户2"]);
  assert.deepEqual(publicAccountNames({ DEMO_PUBLIC_ACCOUNTS: " a , b ,," }), ["a", "b"]);
});

test("postVisibleTo：隔离模式下按作者/虾 owner 判定，admin 无特权，未登录只见演示", () => {
  const demoPost = post({ authorUserId: DEMO });
  const alicePost = post({ authorUserId: ALICE });
  const aliceBotPost = post({ botId: "b1" }); // 虾 owner 为 ALICE
  const seedPost = post(); // 历史种子：无作者无虾

  assert.equal(postVisibleTo(demoPost, null, ctxOn, null), true);          // 未登录见演示
  assert.equal(postVisibleTo(alicePost, null, ctxOn, null), false);        // 未登录不见他人
  assert.equal(postVisibleTo(alicePost, null, ctxOn, ALICE), true);        // 自己见自己
  assert.equal(postVisibleTo(alicePost, null, ctxOn, "u-admin"), false);   // admin 无特权
  assert.equal(postVisibleTo(aliceBotPost, ALICE, ctxOn, ALICE), true);    // 虾帖 owner 可见
  assert.equal(postVisibleTo(aliceBotPost, ALICE, ctxOn, DEMO), false);
  assert.equal(postVisibleTo(seedPost, null, ctxOn, DEMO), false);         // 无主内容无人可见
  // 互通模式恒真
  for (const viewer of [null, ALICE, "u-admin"]) {
    assert.equal(postVisibleTo(alicePost, null, ctxOff, viewer), true);
  }
});

test("docVisibleTo：作者或 ownerBotIds 对应虾的 owner 命中即可见", () => {
  const botsById = new Map([["b1", bot(DEMO)], ["b2", bot(ALICE)]]);
  assert.equal(docVisibleTo(doc({ authorUserId: DEMO }), botsById, ctxOn, null), true);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b2"] }), botsById, ctxOn, ALICE), true);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b2"] }), botsById, ctxOn, null), false);
  assert.equal(docVisibleTo(doc({ ownerBotIds: ["b1"] }), botsById, ctxOn, null), true); // 演示虾的文档
});

test("botVisibleTo：虾 owner ∈ 演示 ∪ 自己", () => {
  assert.equal(botVisibleTo(bot(DEMO), ctxOn, null), true);
  assert.equal(botVisibleTo(bot(ALICE), ctxOn, ALICE), true);
  assert.equal(botVisibleTo(bot(ALICE), ctxOn, DEMO), false);
  assert.equal(botVisibleTo(bot(null), ctxOn, ALICE), false); // 历史种子虾不可见
});

test("replyVisibleTo：人类回复看 authorUserId，虾回复看虾 owner", () => {
  const botsById = new Map([["b1", bot(ALICE)]]);
  assert.equal(replyVisibleTo(reply({ authorUserId: ALICE }), botsById, ctxOn, ALICE), true);
  assert.equal(replyVisibleTo(reply({ authorUserId: ALICE }), botsById, ctxOn, DEMO), false);
  assert.equal(replyVisibleTo(reply({ authorType: "bot", authorBotId: "b1" }), botsById, ctxOn, ALICE), true);
  assert.equal(replyVisibleTo(reply({ authorType: "bot", authorBotId: "b1" }), botsById, ctxOn, null), false);
});

test("commentVisibleTo：人类评论看 authorUserId，虾评论看虾 owner（演示/自己/他人/未登录）", () => {
  const botsById = new Map([["b1", bot(ALICE)]]);
  const humanDemo = { authorUserId: DEMO, authorBotId: null };
  const humanAlice = { authorUserId: ALICE, authorBotId: null };
  const botComment = { authorUserId: null, authorBotId: "b1" };

  // viewer = 演示账号
  assert.equal(commentVisibleTo(humanDemo, botsById, ctxOn, DEMO), true);
  assert.equal(commentVisibleTo(humanAlice, botsById, ctxOn, DEMO), false);
  assert.equal(commentVisibleTo(botComment, botsById, ctxOn, DEMO), false);
  // viewer = 归属者自己
  assert.equal(commentVisibleTo(humanAlice, botsById, ctxOn, ALICE), true);
  assert.equal(commentVisibleTo(botComment, botsById, ctxOn, ALICE), true); // 虾评论 owner 可见
  // viewer = 无关他人
  assert.equal(commentVisibleTo(humanAlice, botsById, ctxOn, "u-bob"), false);
  assert.equal(commentVisibleTo(botComment, botsById, ctxOn, "u-bob"), false);
  // viewer = 未登录：只见演示
  assert.equal(commentVisibleTo(humanDemo, botsById, ctxOn, null), true);
  assert.equal(commentVisibleTo(humanAlice, botsById, ctxOn, null), false);
  assert.equal(commentVisibleTo(botComment, botsById, ctxOn, null), false);
  // 互通模式恒真
  for (const viewer of [DEMO, ALICE, "u-bob", null]) {
    assert.equal(commentVisibleTo(humanAlice, botsById, ctxOff, viewer), true);
    assert.equal(commentVisibleTo(botComment, botsById, ctxOff, viewer), true);
  }
});
