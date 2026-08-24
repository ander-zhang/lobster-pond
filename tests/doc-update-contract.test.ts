import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { nextDocStateAfterUserUpdate, prefillUpdateDocDomain, prefillUpdateDocScenario } from "../src/lib/services/doc-service.ts";
import { docInputSchema } from "../src/lib/services/schemas.ts";
import { parseKnowledgeUpload } from "../src/lib/doc-upload.ts";

const source = fs.readFileSync(path.join(process.cwd(), "src/lib/services/doc-service.ts"), "utf8");
const updateSource = source.slice(source.indexOf("export async function updateDocFromUpload"), source.indexOf("export function canUpdateDoc"));

describe("文档文件更新规则", () => {
  it("修订 id 恒定：知识与技能均沿用原 id，不随新文件 id/name 改变", () => {
    assert.match(updateSource, /id: existing\.id/);
    assert.doesNotMatch(updateSource, /value\.id \?\? existing\.id/);
    assert.doesNotMatch(updateSource, /existing\.type !== "knowledge" && value\.id !== id/);
  });

  it("技能修订校验 id 前后一致：新包 SKILL.md 的 name（id）与原文档不同则 422", () => {
    assert.match(updateSource, /existing\.type === "skills" && value\.id !== id/);
    assert.match(updateSource, /技能修订时包内 SKILL\.md 的 name（id）必须与原文档一致/);
  });

  it("用户网页修订直接进入已批准：已批准 / 待留意 → 已批准（信任人类作者，不强制复审）", () => {
    // 入口守卫：仅已批准、待留意、复盘中三种状态允许更新（不变）
    assert.match(updateSource, /existing\.contentState !== "Approved"/);
    assert.match(updateSource, /existing\.contentState !== "Needs Attention"/);
    assert.match(updateSource, /existing\.contentState !== "Reviewing"/);
    // 用户路径分流：调用 nextDocStateAfterUserUpdate（虾 CLI 路径仍用 nextDocStateAfterUpdate，见 cli-doc-revision.test.ts）
    assert.match(updateSource, /nextDocStateAfterUserUpdate\(existing\.contentState\)/);
    // 驳回审计字段仍清空
    assert.match(updateSource, /rejectedAt: null/);
    assert.match(updateSource, /rejector: null/);
    assert.match(updateSource, /rejectionReason: null/);
  });

  it("用户网页修订分流纯函数 nextDocStateAfterUserUpdate：已批准 / 待留意 / 复盘中 → 已批准", () => {
    // 用户（网页）修订信任人类作者，修订即恢复已批准。复盘中对用户上传文档不可达
    //（rejectDoc 仅从 Needs Review 触发，用户修订从不进入 Needs Review），断言其亦恢复
    // 已批准以固化防御语义（避免误达时卡死）。
    assert.equal(nextDocStateAfterUserUpdate("Approved"), "Approved");
    assert.equal(nextDocStateAfterUserUpdate("Needs Attention"), "Approved");
    assert.equal(nextDocStateAfterUserUpdate("Reviewing"), "Approved");
  });

  it("知识、技能修订均沿用原 id，分类（领域 / 场景）经 ...existing 保留，内容以新文件为准", () => {
    assert.match(updateSource, /id: existing\.id/);
    // 分类由 ...existing 携带（知识 domain/category/subtype、技能 scenario），不取自新文件。
    assert.match(updateSource, /\.\.\.existing/);
    assert.doesNotMatch(updateSource, /domain: value\.domain/);
    for (const field of ["title", "tags", "summary", "body"]) {
      assert.match(updateSource, new RegExp(`${field}: value\\.${field}`));
    }
  });

  it("发布者不变：ownerBotIds 沿用原文档，不因新文件 frontmatter 改变", () => {
    // 归属虾沿用原文档（authorUserId / createdAt 由 ...existing 保留），修订不改变发布者。
    assert.match(updateSource, /ownerBotIds: existing\.ownerBotIds/);
    assert.doesNotMatch(updateSource, /ownerBotIds: value\.ownerBotIds/);
    // 不再按新文件 frontmatter 校验 ownerBotIds 存在性。
    assert.doesNotMatch(updateSource, /missingOwners/);
  });

  it("详情页详细信息卡片仅修订过的文档展示更新时间", () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/library/[type]/[id]/page.tsx"), "utf8");
    const governIndex = pageSource.indexOf("function buildGovernanceRows");
    assert.ok(governIndex > 0);
    const rowsBlock = pageSource.slice(governIndex, pageSource.indexOf("function listAssetFiles"));
    // 批准时间行（优先 approved_at；历史已批准无值时回退发布时间，仅 Approved 态）之后按 hasUpdate 条件渲染更新时间行。
    assert.match(rowsBlock, /批准时间/);
    assert.match(rowsBlock, /doc\.approvedAt \?\? \(doc\.contentState === "Approved" \? \(doc\.createdAt \?\? doc\.updatedAt\) : null\)/);
    assert.match(rowsBlock, /hasUpdate/);
    assert.match(rowsBlock, /label: "更新时间"/);
    // 值：revised_at 非空按「年/月/日 时:分」展示（含年份）；回退到 updatedAt（只存日期）按 formatDateOnly。
    assert.match(rowsBlock, /doc\.revisedAt \? formatDateTime\(doc\.revisedAt\) : formatDateOnly\(doc\.updatedAt\)/);
    // 判定：优先 revised_at（带时分的修订时刻，能识别同日新建+同日修订）；为 null 时回退到
    // createdAt 日期 ≠ updatedAt（兼容本列上线前已修订的历史文档）；createdAt 为 null 不展示。
    assert.match(rowsBlock, /doc\.revisedAt != null/);
    assert.match(rowsBlock, /dateKeyInTimezone\(doc\.createdAt\) !== doc\.updatedAt/);
    assert.match(rowsBlock, /doc\.createdAt != null/);
  });

  it("修订写入修订时刻 revised_at：两个更新函数均置 revisedAt，落库列由 insertDocQuery 写入", () => {
    // 两个修订函数都把修订时刻（带时分 ISO）写进 doc 对象，供 replaceDoc→insertDocQuery 落库。
    assert.match(updateSource, /revisedAt: new Date\(\)\.toISOString\(\)/);
    const botSource = source.slice(source.indexOf("export async function updateDocFromBotUpload"), source.indexOf("export function canReviewDoc"));
    assert.match(botSource, /revisedAt: new Date\(\)\.toISOString\(\)/);
    // insertDocQuery 把 doc.revisedAt 写入 docs.revised_at 列（新建为 null，修订为时刻）。
    const mutationsSource = fs.readFileSync(path.join(process.cwd(), "src/lib/content-mutations.ts"), "utf8");
    assert.match(mutationsSource, /\brevised_at\b/);
    assert.match(mutationsSource, /\$\{doc\.revisedAt \?\? null\}/);
  });

  it("修订强制版本：两个更新函数均调用 validateVersionedUpdate 并写入校验后的版本", () => {
    const calls = updateSource.match(/validateVersionedUpdate\(existing\.version, value\.version\)/g) ?? [];
    assert.ok(calls.length >= 2, `两个更新函数都应调用 validateVersionedUpdate（当前 ${calls.length} 处）`);
    const writes = updateSource.match(/version: versionDecision\.version/g) ?? [];
    assert.ok(writes.length >= 2, `两个更新函数都应写入校验后的版本（当前 ${writes.length} 处）`);
    assert.doesNotMatch(updateSource, /version: value\.version \?\? null/);
  });

  it("创建缺省版本默认 1.0.0", () => {
    const createSource = source.slice(source.indexOf("export async function createDoc"), source.indexOf("export function findDuplicateDocBody"));
    assert.match(createSource, /version: value\.version \?\? "1\.0\.0"/);
  });

  it("发布即批准：网页直接发布（contentState=Approved）在 createDoc 即写 approvedAt，待审核为 null", () => {
    const createSource = source.slice(source.indexOf("export async function createDoc"), source.indexOf("export function findDuplicateDocBody"));
    assert.match(createSource, /approvedAt: resolvedContentState === "Approved" \? new Date\(\)\.toISOString\(\) : null/);
  });

  it("修订分流批准时间：已批准修订沿用原 approvedAt，待留意 / 复盘中修订清空", () => {
    assert.match(updateSource, /approvedAt: nextContentState === "Approved" \? existing\.approvedAt \?\? null : null/);
  });
});

describe("修订文档领域预填（updateDocFromUpload 缺省 domain 保留原领域）", () => {
  // 知识 .md 夹具：frontmatter 的 domain 行由 extra 注入（空 = 缺省）。
  const knowledgeMd = (extra: string) => `---
category: 经验
title: 修订预填夹具
tags: [docs]
${extra}
ownerBotIds: [relay-ops]
summary: 这是一个足够长的摘要用于通过文档校验。
---
正文内容，至少十个字符。`;

  it("frontmatter 缺 domain 时预填原文档领域，schema 校验通过且保留原领域", () => {
    const docInput = parseKnowledgeUpload(knowledgeMd(""));
    assert.equal(docInput.domain, "");

    const prefilled = prefillUpdateDocDomain(docInput, "数据与算法");
    const parsed = docInputSchema.safeParse(prefilled);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
    assert.equal((parsed.data as { domain: string }).domain, "数据与算法");
  });

  it("已带合法 domain 的输入原样保留，不被预填覆盖", () => {
    const docInput = parseKnowledgeUpload(knowledgeMd("domain: 安全"));

    const prefilled = prefillUpdateDocDomain(docInput, "数据与算法");
    const parsed = docInputSchema.safeParse(prefilled);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
    assert.equal((parsed.data as { domain: string }).domain, "安全");
  });
});

describe("修订文档场景预填（技能缺省 scenario 保留原场景）", () => {
  const skillDraft = (scenario: string) => ({
    type: "skills" as const,
    id: "relay-ops",
    title: "技能修订预填夹具",
    tags: ["ops"],
    scenario,
    ownerBotIds: [],
    summary: "一个足够长的摘要用于通过文档校验。",
    body: "正文内容，至少十个字符。",
  });

  it("frontmatter 缺 scenario 时预填原文档场景，schema 校验通过且保留原场景", () => {
    const prefilled = prefillUpdateDocScenario(skillDraft(""), "编程开发");
    const parsed = docInputSchema.safeParse(prefilled);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
    assert.equal((parsed.data as { scenario: string }).scenario, "编程开发");
  });

  it("已带合法 scenario 的输入原样保留，不被预填覆盖", () => {
    const prefilled = prefillUpdateDocScenario(skillDraft("数据分析"), "编程开发");
    const parsed = docInputSchema.safeParse(prefilled);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
    assert.equal((parsed.data as { scenario: string }).scenario, "数据分析");
  });
});
