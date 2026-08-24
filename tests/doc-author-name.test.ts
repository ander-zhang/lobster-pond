import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { docAuthorName } from "../src/lib/doc-author-name.ts";
import type { Bot, MarkdownDoc } from "../src/lib/types.ts";

const bot = (id: string, name: string): Bot => ({
  id,
  name,
  role: "个人虾",
  master: "",
  ownerUserId: "u-1",
  summary: "",
  domains: [],
  version: "v1",
  model: "deepseek",
  createdAt: null,
});

const doc = (overrides: Partial<MarkdownDoc>): MarkdownDoc => ({
  id: "doc-1",
  title: "知识文档",
  tags: [],
  domain: "",
  category: "经验",
  subtype: null,
  updatedAt: "2026-08-01",
  ownerBotIds: [],
  summary: "摘要",
  body: "正文",
  type: "knowledge",
  contentState: "Needs Review",
  version: null,


  evidence: null,
  authorUserId: null,
  ...overrides,
} as MarkdownDoc);

describe("docAuthorName：文档发布者署名派生", () => {
  const bots = [bot("bot-a", "虾A"), bot("bot-b", "虾B")];
  const botsById = new Map(bots.map((b) => [b.id, b] as const));
  const authorNames = new Map([["user-1", "alice"]]);

  it("虾上传的文档优先展示虾名（ownerBotIds → 虾名）", () => {
    const name = docAuthorName(
      doc({ ownerBotIds: ["bot-a"], authorUserId: "user-1" }),
      botsById,
      authorNames,
    );
    assert.equal(name, "虾A");
  });

  it("虾不存在于 bots 时回退到 owner 用户名（authorUserId）", () => {
    const name = docAuthorName(
      doc({ ownerBotIds: ["bot-missing"], authorUserId: "user-1" }),
      botsById,
      authorNames,
    );
    assert.equal(name, "alice");
  });

  it("Web 用户上传（无 ownerBotIds）时展示用户名", () => {
    const name = docAuthorName(
      doc({ ownerBotIds: [], authorUserId: "user-1" }),
      botsById,
      authorNames,
    );
    assert.equal(name, "alice");
  });

  it("历史/种子文档（无虾无主）回退到未署名", () => {
    const name = docAuthorName(
      doc({ ownerBotIds: [], authorUserId: null }),
      botsById,
      authorNames,
    );
    assert.equal(name, "未署名");
  });

  it("多个 ownerBotIds 时优先第一个存在的虾名", () => {
    const name = docAuthorName(
      doc({ ownerBotIds: ["bot-missing", "bot-b"], authorUserId: "user-1" }),
      botsById,
      authorNames,
    );
    assert.equal(name, "虾B");
  });
});
