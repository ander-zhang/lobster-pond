import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canReviewPost, replyEntersMonitoring, shouldReopenPostOnReply } from "../src/lib/services/post-service.ts";
import { canReviewDoc } from "../src/lib/services/doc-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "u-1", username: "张三", role: "member" };
const other: SessionUser = { id: "u-2", username: "李四", role: "member" };
const admin: SessionUser = { id: "u-3", username: "root", role: "admin" };

describe("canReviewPost 审批授权矩阵", () => {
  it("未登录 → 401", () => {
    const result = canReviewPost(null, "u-1", null);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("发布者本人（authorUserId 匹配）→ 放行", () => {
    const result = canReviewPost(owner, "u-1", null);
    assert.equal(result.allowed, true);
  });

  it("发布者虾的 owner（botOwnerUserId 匹配）→ 放行", () => {
    const result = canReviewPost(owner, null, "u-1");
    assert.equal(result.allowed, true);
  });

  it("authorUserId 不匹配但虾的 owner 匹配 → 放行（CLI 虾发布、owner 审批）", () => {
    const result = canReviewPost(owner, "u-9", "u-1");
    assert.equal(result.allowed, true);
  });

  it("非发布者、非虾 owner 的普通用户 → 403", () => {
    const result = canReviewPost(other, "u-1", "u-1");
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员无越权：既非发布者也非虾 owner → 403", () => {
    const result = canReviewPost(admin, "u-1", null);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("无 owner 的种子帖（authorUserId=null、botOwnerUserId=null）→ 任何用户 403", () => {
    const result = canReviewPost(admin, null, null);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });
});

describe("shouldReopenPostOnReply 新回复重开审批", () => {
  it("已审批（reviewedAt 非空）→ 新回复应撤销审批、回到观察中", () => {
    assert.equal(shouldReopenPostOnReply({ reviewedAt: "2026-07-18T01:00:00.000Z" }), true);
  });

  it("未审批（reviewedAt 为 null，open / monitoring）→ 不撤销", () => {
    assert.equal(shouldReopenPostOnReply({ reviewedAt: null }), false);
  });
});

describe("replyEntersMonitoring 新回复是否进入观察中", () => {
  it("未处理帖收到首条回复（open）→ 进入观察中", () => {
    assert.equal(replyEntersMonitoring({ status: "open", reviewedAt: null }), true);
  });

  it("已解决帖被新回复重开（resolved）→ 重新进入观察中", () => {
    assert.equal(replyEntersMonitoring({ status: "resolved", reviewedAt: "2026-07-18T01:00:00.000Z" }), true);
  });

  it("已在观察中的帖子（monitoring）加回复 → 不改变进入时刻", () => {
    assert.equal(replyEntersMonitoring({ status: "monitoring", reviewedAt: null }), false);
  });
});

describe("canReviewDoc 文档审批授权矩阵（虾 owner 分支）", () => {
  it("发布者本人（authorUserId 匹配）→ 放行", () => {
    assert.equal(canReviewDoc(owner, "u-1", []).allowed, true);
  });

  it("文档归属虾的 owner → 放行（虾内容 authorUserId 置空后靠 ownerBotIds 判定）", () => {
    assert.equal(canReviewDoc(owner, null, ["u-1"]).allowed, true);
  });

  it("非虾 owner 的普通用户 → 403", () => {
    const result = canReviewDoc(other, null, ["u-1"]);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员无越权：非发布者也非虾 owner → 403", () => {
    const result = canReviewDoc(admin, null, ["u-1"]);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("无归属的文档（ownerBotIds 空）→ 任何用户 403（种子/历史文档无人可审）", () => {
    const result = canReviewDoc(admin, null, []);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });
});

describe("canReviewDoc 转审分支（审批权转交后仅被转审人可审）", () => {
  it("被转审人（reviewTransferredToUserId 匹配）→ 放行", () => {
    assert.equal(canReviewDoc(other, null, ["u-1"], "u-2").allowed, true);
  });

  it("已转审后原虾 owner → 403（审批权已整体转交，owner 失去审批权）", () => {
    const result = canReviewDoc(owner, null, ["u-1"], "u-2");
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("已转审后发布者本人（authorUserId 匹配）→ 403（转审覆盖原授权路径）", () => {
    const result = canReviewDoc(owner, "u-1", [], "u-2");
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("已转审后管理员 → 403（管理员无越权，转审不改变此原则）", () => {
    const result = canReviewDoc(admin, null, ["u-1"], "u-2");
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("未转审（reviewTransferredToUserId 为 null）→ 沿用原授权矩阵", () => {
    assert.equal(canReviewDoc(owner, null, ["u-1"], null).allowed, true);
    assert.equal(canReviewDoc(other, null, ["u-1"], null).allowed, false);
  });
});
