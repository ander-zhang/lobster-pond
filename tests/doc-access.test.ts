import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeleteDoc, canReviewDoc, canUpdateDoc, isMineDoc } from "../src/lib/services/doc-service.ts";
import type { MarkdownDoc } from "../src/lib/types.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "user-1", username: "alice", role: "member" };
const other: SessionUser = { id: "user-2", username: "bob", role: "member" };
const admin: SessionUser = { id: "admin-1", username: "root", role: "admin" };

describe("canDeleteDoc 授权矩阵", () => {
  it("发布者本人可删自己的文档", () => {
    assert.deepEqual(canDeleteDoc(owner, owner.id), { allowed: true });
  });

  it("其他登录用户不能删别人的文档 → 403", () => {
    const result = canDeleteDoc(other, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员无越权删别人的文档 → 403（与删问题帖 / 删虾一致）", () => {
    const result = canDeleteDoc(admin, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("未登录 → 401", () => {
    const result = canDeleteDoc(null, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("无 authorUserId 的历史/种子文档：未登录 → 401，登录用户 → 403", () => {
    assert.equal((canDeleteDoc(null, null) as { status: number }).status, 401);
    assert.equal((canDeleteDoc(other, null) as { status: number }).status, 403);
    assert.equal((canDeleteDoc(owner, null) as { status: number }).status, 403);
  });
});

describe("canUpdateDoc 授权矩阵", () => {
  it("发布者本人可更新自己的文档", () => {
    assert.deepEqual(canUpdateDoc(owner, owner.id), { allowed: true });
  });

  it("其他用户和管理员不能更新别人的文档", () => {
    assert.equal((canUpdateDoc(other, owner.id) as { status: number }).status, 403);
    assert.equal((canUpdateDoc(admin, owner.id) as { status: number }).status, 403);
  });

  it("未登录为 401，历史无主文档为 403", () => {
    assert.equal((canUpdateDoc(null, owner.id) as { status: number }).status, 401);
    assert.equal((canUpdateDoc(owner, null) as { status: number }).status, 403);
  });
});

describe("canReviewDoc 审批授权矩阵", () => {
  it("未登录 → 401", () => {
    const result = canReviewDoc(null, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("发布者本人（authorUserId 匹配）→ 放行", () => {
    assert.deepEqual(canReviewDoc(owner, owner.id), { allowed: true });
  });

  it("非发布者的普通用户 → 403", () => {
    const result = canReviewDoc(other, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员无越权：非发布者 → 403", () => {
    const result = canReviewDoc(admin, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("无 authorUserId 的历史/种子文档：任何用户 → 403", () => {
    const result = canReviewDoc(admin, null);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });
});

// mine 列表归属判定：只把「该虾本人经 CLI 发布的文档」算作该虾的「我的文档」。
// 关键判据是 authorUserId===null——虾 CLI 发布恒置空（route.ts 传 null currentUser，
// 迁移 046 回填），Web 用户发布恒非空。仅看 ownerBotIds 不够：Web 上传若信任 frontmatter
// ownerBotIds（如重传导出的虾文档），会把人发文档混进虾 mine 列表（泄露）。
function mineDoc(overrides: Partial<Pick<MarkdownDoc, "ownerBotIds" | "authorUserId">> = {}) {
  return { ownerBotIds: [] as string[], authorUserId: null as string | null, ...overrides };
}

describe("isMineDoc 我的文档归属矩阵", () => {
  it("虾本人经 CLI 发布的文档（authorUserId 置空、ownerBotIds 含本虾）→ 命中", () => {
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: ["bot-a"], authorUserId: null }), "bot-a"), true);
  });

  it("虾本人已批准的文档仍归属本虾（mine 含全状态，不限于未批准）", () => {
    // isMineDoc 不看 contentState；Approved 的虾文档同样命中。
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: ["bot-a"], authorUserId: null }), "bot-a"), true);
  });

  it("Web 用户发布且 frontmatter 带了 ownerBotIds 也不算该虾本人发布（堵泄露）", () => {
    // authorUserId 非空 = 人发布；旧逻辑只看 ownerBotIds 会误命中，现按 authorUserId 排除。
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: ["bot-a"], authorUserId: "user-1" }), "bot-a"), false);
  });

  it("其他虾发布的文档（ownerBotIds 不含本虾、authorUserId 置空）→ 不命中", () => {
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: ["bot-b"], authorUserId: null }), "bot-a"), false);
  });

  it("Web 用户正常上传的文档（ownerBotIds 空、authorUserId 非空）→ 不命中", () => {
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: [], authorUserId: "user-1" }), "bot-a"), false);
  });

  it("无主历史/种子文档（ownerBotIds 空、authorUserId 空）→ 不命中", () => {
    assert.equal(isMineDoc(mineDoc({ ownerBotIds: [], authorUserId: null }), "bot-a"), false);
  });
});
