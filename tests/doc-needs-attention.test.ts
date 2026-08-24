import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { contentStateBadgeClass, contentStateFormalUse, contentStateLabel } from "../src/lib/format.ts";
import { buildGovernanceView } from "../src/lib/governance.ts";
import { contentStateSchema } from "../src/lib/services/schemas.ts";
import type { MarkdownDoc, Bot } from "../src/lib/types.ts";

function attentionDoc(): MarkdownDoc {
  return {
    id: "attention-doc",
    title: "待留意知识",
    tags: [],
    domain: "knowledge",
    category: "经验",
    subtype: null,
    updatedAt: "2026-07-27",
    ownerBotIds: ["bot-1"],
    summary: "收到新评论后的知识",
    body: "正文",
    type: "knowledge",
    contentState: "Needs Attention",
    version: null,


    evidence: null,
    authorUserId: "user-1",
  };
}

const botFixture = (id: string, name: string): Bot => ({
  id,
  name,
  role: "个人虾",
  master: "",
  ownerUserId: "u1",
  summary: "",
  domains: [],
  version: "v1",
  model: "deepseek",
  createdAt: null,
});

describe("文档待留意状态", () => {
  it("识别状态、显示待留意并使用暖橙徽标", () => {
    assert.equal(contentStateSchema.parse("Needs Attention"), "Needs Attention");
    assert.equal(contentStateLabel("Needs Attention"), "待留意");
    assert.equal(contentStateBadgeClass("Needs Attention"), "state-badge-orange");
    assert.equal(contentStateFormalUse("Needs Attention"), "caution");
  });

  it("审核预览卡片复用状态徽标配色", async () => {
    const source = await readFile(new URL("../src/components/ReviewItemQueue.tsx", import.meta.url), "utf8");
    assert.match(source, /<StateBadge state=\{item\.state\} size="sm" className="ml-auto" \/>/);
    assert.doesNotMatch(source, /bg-\[var\(--surface-3\)\].*text-knowledge/);
  });

  it("在治理视图中进入独立的待留意分桶", () => {
    const view = buildGovernanceView([attentionDoc()], new Map([["user-1", "alice"]]));
    assert.equal(view.buckets.find((bucket) => bucket.key === "needs-review")?.items.length, 0);
    const attention = view.buckets.find((bucket) => bucket.key === "needs-attention");
    assert.deepEqual(attention?.items.map((item) => item.id), ["attention-doc"]);
    assert.match(attention?.items[0]?.reasons?.[0] ?? "", /新评论/);
  });

  it("虾发布的文档在治理视图中优先展示虾名", () => {
    const view = buildGovernanceView(
      [attentionDoc()],
      new Map([["user-1", "alice"]]),
      new Map([["bot-1", botFixture("bot-1", "虾一")] as const]),
    );
    const item = view.items.find((entry) => entry.id === "attention-doc")!;
    assert.equal(item.authorName, "虾一");
  });

  it("评论写入与状态切换在同一事务中，并仅切换 Approved", async () => {
    const source = await readFile(new URL("../src/lib/services/doc-comment-service.ts", import.meta.url), "utf8");
    assert.match(source, /set content_state = 'Needs Attention'/);
    assert.match(source, /where id = \$\{docId\} and content_state = 'Approved'/);
  });

  it("详情页允许发布者修订待留意文档，但不直接审批旧评论状态", async () => {
    const source = await readFile(new URL("../src/app/library/[type]/[id]/page.tsx", import.meta.url), "utf8");
    assert.match(source, /const canUpdate = isAuthor && \(isApproved \|\| needsAttention \|\| doc\.contentState === "Reviewing"\)/);
    assert.match(source, /const showApprove = isDocReviewer && \(doc\.contentState === "Needs Review" \|\| needsAttention\)/);
    assert.match(source, /const showHeaderActions = canUpdate \|\| canDelete \|\| showApprove/);
  });

  it("待留意文档不可由审批接口晋升，避免与新评论的状态切换竞争", async () => {
    const source = await readFile(new URL("../src/lib/services/doc-service.ts", import.meta.url), "utf8");
    const reviewSource = source.slice(source.indexOf("export async function reviewDoc"), source.indexOf("export async function rejectDoc"));
    assert.match(reviewSource, /doc\.contentState !== "Needs Review"/);
    assert.match(reviewSource, /approveDocState\(docId, approvedAt, currentUser!\.username, doc\.contentState\)/);
    assert.match(reviewSource, /doc\.contentState !== "Needs Review" && doc\.contentState !== "Needs Attention"/);
    // 审批通过写入批准时间 approved_at 与审批人 approver（与驳回写 rejected_at / rejector
    // 对称），落库由 approveDocState 完成。
    const mutationsSource = await readFile(new URL("../src/lib/content-mutations.ts", import.meta.url), "utf8");
    assert.match(mutationsSource, /set content_state = 'Approved', approved_at = .*, approver = /);
  });
});
