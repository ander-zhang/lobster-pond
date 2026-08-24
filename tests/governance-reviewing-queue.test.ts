import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("governance reviewing mixed queue", () => {
  it("places the mixed queue directly below monitoring posts while retaining the document review column", async () => {
    const page = await readSource("../src/app/governance/page.tsx");

    assert.match(page, /<PostReviewQueue posts=\{pendingReviewPosts\} \/>\s*<ReviewingMixedQueue items=\{view\.items\} bots=\{bots\} \/>/);
    assert.match(page, /<ReviewItemQueue items=\{pendingReviewItems\} bots=\{bots\} \/>/);
    assert.match(page, /<ReviewItemQueue items=\{needsAttentionItems\} bots=\{bots\} title="待留意的知识\/技能" itemLabel="待留意" \/>/);

    const reviewQueue = await readSource("../src/components/ReviewItemQueue.tsx");
    assert.match(reviewQueue, /<section className="bento-card self-start p-5 md:p-6">/);
  });

  it("includes reviewing documents with the requested filters and five-card measurement", async () => {
    const queue = await readSource("../src/components/ReviewingMixedQueue.tsx");

    assert.match(queue, /item\.state === "Reviewing"/);
    assert.match(queue, />搜索</);
    assert.match(queue, /label="类别"/);
    // 虾下拉与领域下拉筛选均已移除（搜索框仍可按虾名匹配）。
    assert.doesNotMatch(queue, /label="虾"/);
    assert.doesNotMatch(queue, /label="领域"/);
    assert.doesNotMatch(queue, /value: "post"/);
    assert.match(queue, /知识/);
    assert.match(queue, /技能/);
    assert.match(queue, /日期/);
    assert.match(queue, /cards\.length > 5/);
    assert.match(queue, /cards\[5\]\.getBoundingClientRect/);
    assert.match(queue, /\$\{item\.href\}\?from=governance/);
    assert.match(queue, /<StateBadge state=\{item\.state\} size="sm" className="ml-auto state-badge-black" \/>/);
    assert.match(queue, /skill-preview-card/);
    assert.match(queue, /knowledge-preview-card/);

    const postCard = await readSource("../src/components/ProblemPacketCard.tsx");
    assert.match(postCard, /post\.status === "monitoring" \? "border-\[rgba\(195,125,13,0\.3\)\] bg-\[var\(--amber-soft\)\] text-\[var\(--amber-strong\)\]"/);
    assert.match(postCard, /post\.status === "resolved" \? "border-\[rgba\(0,180,138,0\.28\)\] bg-\[var\(--accent-soft\)\] text-\[var\(--accent-strong\)\]"/);
    assert.match(postCard, /"border-\[rgba\(212,86,86,0\.3\)\] bg-\[var\(--rose-soft\)\] text-\[var\(--rose-strong\)\]"/);

    const postPage = await readSource("../src/app/posts/[id]/page.tsx");
    assert.match(postPage, /<ArtifactCapsules capsules=\{artifactCapsules\} status=\{post\.status\} \/>/);
    assert.match(postPage, /status === "monitoring" \? "border-\[rgba\(195,125,13,0\.3\)\] bg-\[var\(--amber-soft\)\] text-\[var\(--amber-strong\)\]"/);
    assert.match(postPage, /status === "open" \? "border-\[rgba\(212,86,86,0\.3\)\] bg-\[var\(--rose-soft\)\] text-\[var\(--rose-strong\)\]"/);
  });

  it("returns governance-originated post and document details to the review page", async () => {
    const reviewQueue = await readSource("../src/components/ReviewItemQueue.tsx");
    const postQueue = await readSource("../src/components/PostReviewQueue.tsx");

    // 四个卡片均已移除【虾】下拉筛选框；除"观察中的问题帖"外，其余三个卡片
    // 也已移除【领域】下拉筛选框（搜索框仍可按虾名匹配）。
    assert.doesNotMatch(reviewQueue, /label="虾"/);
    assert.doesNotMatch(postQueue, /label="虾"/);
    assert.doesNotMatch(reviewQueue, /label="领域"/);
    // 问题帖卡片保留领域筛选。
    assert.match(postQueue, /label="领域"/);

    const postCard = await readSource("../src/components/ProblemPacketCard.tsx");
    const postPage = await readSource("../src/app/posts/[id]/page.tsx");
    const docPage = await readSource("../src/app/library/[type]/[id]/page.tsx");

    assert.match(reviewQueue, /\$\{item\.href\}\?from=governance/);
    assert.match(postQueue, /compact fromGovernance/);
    assert.match(postCard, /fromGovernance \? "\?from=governance" : ""/);
    assert.match(postPage, /detailOrigin === "governance" \? "\/governance"/);
    assert.match(postPage, /<BackButton fallbackHref=\{backHref\} \/>/);
    assert.match(docPage, /detailOrigin === "governance" \? "\/governance"/);
    assert.match(docPage, /<BackButton fallbackHref=\{backHref\} \/>/);
  });

  it("exposes all governance documents so the page can select Reviewing entries", async () => {
    const governance = await readSource("../src/lib/governance.ts");

    assert.match(governance, /items: GovernanceItem\[\]/);
    assert.match(governance, /return \{ buckets, items: all, metrics \}/);
  });
});
