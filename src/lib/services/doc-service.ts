import { getBots, getDocs } from "../content.ts";
import { insertDoc, insertDocQuery, replaceDoc, approveDocState, rejectDocState } from "../content-mutations.ts";
import { formatZodError, type ServiceResult } from "./bot-service.ts";
import { docInputSchema, rejectionInputSchema, docTransferInputSchema, type DocInput } from "./schemas.ts";
import { allocateKnowledgeId, fallbackKnowledgeId } from "./doc-id-service.ts";
import type { Bot, ContentState, DocAsset, MarkdownDoc } from "../types";
import type { SessionUser } from "./session.ts";
import { insertBotDocRejectionNotification } from "./bot-notification-service.ts";
import { insertReviewTransferNotification } from "./notification-service.ts";
import { getOptionalSql, getSql } from "../db.ts";
import { validateVersionedUpdate } from "../versioning.ts";

// Creates a knowledge or skill document. Validates that every owner bot exists
// and that the id is free (unless an overwrite is explicitly requested).
export async function createDoc(
  input: unknown,
  currentUser: SessionUser | null = null,
  options: { allowOverwrite?: boolean; contentState?: ContentState } = {},
): Promise<ServiceResult<MarkdownDoc>> {
  const parsed = docInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const value: DocInput = parsed.data;
  const [bots, docs] = await Promise.all([getBots(), getDocs()]);

  const botIds = new Set(bots.map((bot) => bot.id));
  const missingOwners = value.ownerBotIds.filter((id) => !botIds.has(id));
  if (missingOwners.length > 0) {
    return { ok: false, error: `unknown ownerBotIds: ${missingOwners.join(", ")}` };
  }

  // 知识 id 由系统自动分配（value.id 为空）；技能沿用文件 id。冲突检查仅对技能生效。
  if (value.type !== "knowledge" && !options.allowOverwrite && docs.some((doc) => doc.id === value.id)) {
    return { ok: false, error: `doc id already exists: ${value.id}` };
  }

  // 正文查重：与已有知识 / 技能的正文 trim 后精确比对——同正文即视为"相同文件"，
  // 即使 id / title 不同也阻断，防止换 id 重传同一份内容。allowOverwrite 时不查
  //（显式覆盖场景）。仅比对正文，忽略 frontmatter 元数据差异。
  const dupBody = findDuplicateDocBody(value.body, docs);
  if (dupBody) {
    return { ok: false, error: `存在相同文件请重新上传：与已有文档「${dupBody.title}」正文相同` };
  }

  // 发布即批准：网页直接发布的已批准文档在创建时即记录批准时间（与 createdAt 同刻），
  // 审批人记为作者本人（自审即批准）；虾经机器接口发布进入待审核（resolvedContentState =
  // Needs Review）→ 批准时间 / 审批人留空，审批通过时再写。
  const resolvedContentState = options.contentState ?? "Approved";
  const common = {
    title: value.title,
    tags: value.tags,
    updatedAt: new Date().toISOString().slice(0, 10),
    createdAt: null,
    ownerBotIds: value.ownerBotIds,
    summary: value.summary,
    body: value.body,
    contentState: resolvedContentState,
    approvedAt: resolvedContentState === "Approved" ? new Date().toISOString() : null,
    approver: resolvedContentState === "Approved" ? currentUser?.username ?? null : null,
    version: value.version ?? "1.0.0",
    evidence: value.evidence ?? null,
    rejectedAt: null,
    rejector: null,
    rejectionReason: null,
    authorUserId: currentUser?.id ?? null,
  };
  // 知识 id 占位，下面自动分配；技能沿用文件 id。
  let doc: MarkdownDoc;
  if (value.type === "knowledge") {
    doc = { ...common, id: "", type: "knowledge", domain: value.domain, category: value.category, subtype: value.subtype ?? null };
  } else {
    doc = { ...common, id: value.id, type: "skills", scenario: value.scenario };
  }

  // 知识：系统自动分配 id <领域slug>-<种别slug>-<类型slug>-<编号>（无 k- 前缀；领域+种别+类型三元组计数，单调递增不复用）。
  // 取号与插入放同一事务，避免并发下撞号。无数据库回退生成带随机后缀的临时 id。
  if (value.type === "knowledge") {
    const sql = getOptionalSql();
    if (!sql) {
      doc.id = fallbackKnowledgeId(value.domain, value.category, value.subtype ?? null);
      await insertDoc(doc);
      return { ok: true, data: doc };
    }
    const created = await sql.transaction(async (txn) => {
      const id = await allocateKnowledgeId(value.domain, value.category, value.subtype ?? null, txn);
      const withId: MarkdownDoc = { ...doc, id };
      await insertDocQuery(withId, txn);
      return withId;
    });
    return { ok: true, data: created };
  }

  await insertDoc(doc);
  return { ok: true, data: doc };
}

// 纯函数：正文查重。trim 后精确比对——同正文即判定为"相同文件"。
// 跨知识 / 技能类型比对（用户上传时与所有已上传文档比）。返回冲突文档标题，无冲突返回 null。
// 导出便于单测，避开 DB。
export function findDuplicateDocBody(
  body: string,
  docs: { id?: string; body: string; title: string }[],
  excludeId?: string,
): { title: string } | null {
  const normalized = body.trim();
  if (normalized.length === 0) return null;
  const hit = docs.find((doc) => (excludeId === undefined || doc.id !== excludeId) && doc.body.trim() === normalized);
  return hit ? { title: hit.title } : null;
}

type ReplaceDocInput = {
  docInput: unknown;
  asset?: Omit<DocAsset, "uploadedAt"> | null;
};

// 修订文档领域预填（纯函数，便于单测）：更新流程无领域选择入口（DocUpdateButton
// 只传文件），frontmatter 缺 domain（空串 / 未定义）时保留原文档领域，符合
// "修订保留原领域"契约。传入的非法 domain 原样保留，交由 docInputSchema 校验拒绝。
export function prefillUpdateDocDomain(docInput: unknown, existingDomain: string): unknown {
  if (typeof docInput !== "object" || docInput === null || Array.isArray(docInput)) {
    return docInput;
  }
  const raw = docInput as Record<string, unknown>;
  return { ...raw, domain: raw.domain || existingDomain };
}

// 修订文档场景预填（纯函数，便于单测）：更新流程无场景选择入口（DocUpdateButton
// 只传文件），frontmatter 缺 scenario（空串 / 未定义）时保留原文档场景，符合
// "修订保留原场景"契约。传入的非法 scenario 原样保留，交由 docInputSchema 校验拒绝。
export function prefillUpdateDocScenario(docInput: unknown, existingScenario: string): unknown {
  if (typeof docInput !== "object" || docInput === null || Array.isArray(docInput)) {
    return docInput;
  }
  const raw = docInput as Record<string, unknown>;
  return { ...raw, scenario: raw.scenario || existingScenario };
}

// 修订锁定原种别/类型（与"修订保留原领域"一致）：更新文件只允许改正文 / 版本 /
// 证据来源 / 标题 / 标签 / 摘要，不允许改 id / 领域 / 种别 / 类型。
// 因此始终沿用原文档的 category/subtype，忽略新文件 frontmatter 里写的分类值
// （静默忽略，不报错，与 domain 一致）。要改分类请删除后重新发布。
// 经验的 subtype 为 null → 不写 subtype 键，交由 schema 校验（经验须空）。
export function prefillUpdateDocTaxonomy(
  docInput: unknown,
  existing: { category: string; subtype: string | null },
): unknown {
  if (typeof docInput !== "object" || docInput === null || Array.isArray(docInput)) {
    return docInput;
  }
  const raw = docInput as Record<string, unknown>;
  return { ...raw, category: existing.category, subtype: existing.subtype ?? undefined };
}

// 用上传文件覆盖已有文档。更新操作以详情页路径中的 id 定位原文档，新文件的 id
// 会成为更新后文档的新主键；领域沿用原文档，其余文件内容以新文件为准。
// 文档类型必须与详情页一致。用户修订后直接进入已批准；引用关系、下载计数、作者与首次发布时间均迁移到新 id。
export async function updateDocFromUpload(
  type: MarkdownDoc["type"],
  id: string,
  input: ReplaceDocInput,
  currentUser: SessionUser | null,
): Promise<ServiceResult<MarkdownDoc> | { ok: false; status: number; error: string }> {
  const existing = (await getDocs(type)).find((doc) => doc.id === id);
  if (!existing) {
    return { ok: false, status: 404, error: `文档不存在：${type}/${id}` };
  }

  const decision = canUpdateDoc(currentUser, existing.authorUserId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  if (
    existing.contentState !== "Approved"
    && existing.contentState !== "Needs Attention"
    && existing.contentState !== "Reviewing"
  ) {
    return { ok: false, status: 422, error: "只有已批准、待留意或复盘中的文档才能更新" };
  }

  // 修订锁定原分类（更新流程无分类选择入口，DocUpdateButton 只传文件）：知识沿用
  // 原 domain / category / subtype，技能沿用原 scenario，frontmatter 缺省时回填原值。
  if (existing.type === "knowledge") {
    input.docInput = prefillUpdateDocDomain(input.docInput, existing.domain ?? "");
    input.docInput = prefillUpdateDocTaxonomy(input.docInput, { category: existing.category, subtype: existing.subtype });
  } else {
    input.docInput = prefillUpdateDocScenario(input.docInput, existing.scenario ?? "其他");
  }

  const parsed = docInputSchema.safeParse(input.docInput);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const value = parsed.data;
  if (value.type !== type) {
    return { ok: false, error: "上传文件类型与原文档不一致" };
  }

  // 技能修订 id 必须与原文档一致：新包 SKILL.md 的 name（id）不得改变。
  // 知识上传不填 id（系统自动分配），不在此校验。
  if (existing.type === "skills" && value.id !== id) {
    return { ok: false, status: 422, error: "技能修订时包内 SKILL.md 的 name（id）必须与原文档一致" };
  }

  const [docs] = await Promise.all([getDocs()]);
  // 修订 id 恒定（知识与技能均沿用原 id，不随新文件 id/name 改变）。
  const dupBody = findDuplicateDocBody(value.body, docs, id);
  if (dupBody) {
    return { ok: false, error: `存在相同文件请重新上传：与已有文档「${dupBody.title}」正文相同` };
  }

  // 修订版本约束：必填 + 格式 + 严格递增。历史旧版本自动归一基线后比较。
  const versionDecision = validateVersionedUpdate(existing.version, value.version);
  if (!versionDecision.ok) {
    return { ok: false, status: 422, error: versionDecision.error };
  }

  // 修订后状态按原状态分流（见上方 nextContentState）。清空驳回审计字段：
  // 它描述的是被替代的旧修订版；DB 约束要求三者一起清空。
  const nextContentState = nextDocStateAfterUserUpdate(existing.contentState);
  const doc: MarkdownDoc = {
    ...existing,
    // 修订 id 恒定：知识与技能均沿用原 id（稳定引用，不随新文件 id/name 改变）。
    id: existing.id,
    title: value.title,
    tags: value.tags,
    updatedAt: new Date().toISOString().slice(0, 10),
    // 修订时刻（带时分）：详情页「更新时间」据此展示，同日修订也能识别
    // （updatedAt 只存 YYYY-MM-DD，无法区分同日新建与同日修订）。
    revisedAt: new Date().toISOString(),
    // 发布者不变：ownerBotIds（归属虾）沿用原文档，不因新文件 frontmatter 改变。
    // authorUserId / createdAt 亦由 ...existing 保留，修订不改变发布者与首次发布时间。
    ownerBotIds: existing.ownerBotIds,
    summary: value.summary,
    body: value.body,
    // 修订后状态按原状态分流（见上方 nextContentState）。清空驳回审计字段：
    // 它描述的是被替代的旧修订版；DB 约束要求三者一起清空。
    contentState: nextContentState,
    // 批准时间分流：已批准文档修订后仍为已批准，沿用原 approvedAt；待留意 / 复盘中修订后
    // 进入待审核（不再批准），清空 approvedAt，再次审批通过时重新写入。
    // 审批人 approver 同步分流（沿用 / 清空），与 approvedAt 保持一致。
    approvedAt: nextContentState === "Approved" ? existing.approvedAt ?? null : null,
    approver: nextContentState === "Approved" ? existing.approver ?? null : null,
    rejectedAt: null,
    rejector: null,
    rejectionReason: null,
    version: versionDecision.version,
    evidence: value.evidence ?? null,
  };
  const asset = input.asset
    ? { ...input.asset, docId: doc.id }
    : null;
  const updated = await replaceDoc(id, doc, asset);
  if (!updated) {
    return { ok: false, status: 404, error: `文档不存在：${type}/${id}` };
  }
  return { ok: true, data: doc };
}

// 纯函数：虾经机器接口修订后状态按原状态分流——待留意 / 复盘中 → 待审核（需 owner 人工复审），
// 已批准 → 已批准（修订直接发布）。网页（用户）修订另走 nextDocStateAfterUserUpdate
// （信任人类作者，修订即已批准），两条路径分流函数分离，避免口径漂移。
export function nextDocStateAfterUpdate(current: ContentState): ContentState {
  return current === "Needs Attention" || current === "Reviewing" ? "Needs Review" : "Approved";
}

// 纯函数：用户（网页）修订后状态——信任人类作者，修订即恢复已批准：已批准→已批准、
// 待留意→已批准（不再强制人工复审，与虾经机器接口修订走待审核区分）。复盘中对用户上传
// 文档不可达（rejectDoc 仅从 Needs Review 触发，而用户修订从不进入 Needs Review），
// 即便误达亦恢复已批准避免卡死。入参与 nextDocStateAfterUpdate 对称、便于单测。
export function nextDocStateAfterUserUpdate(current: ContentState): ContentState {
  // 已批准保持已批准；待留意 / 复盘中（不可达）→ 已批准。
  return current === "Approved" ? current : "Approved";
}

// 虾通过机器接口修订自己上传的文档（bot ∈ ownerBotIds）。与网页 updateDocFromUpload
// 同款解析 / 校验 / 状态分流，但授权按「文档归属虾」判定，而非 authorUserId——
// 虾经机器接口上传的文档 authorUserId 绑的是 owner 用户名，虾本人不是该用户，走不了
// 网页授权。返回统一带 status，便于机器接口路由直接透传。
export async function updateDocFromBotUpload(
  type: MarkdownDoc["type"],
  id: string,
  input: ReplaceDocInput,
  bot: Bot,
): Promise<{ ok: true; data: MarkdownDoc } | { ok: false; status: number; error: string }> {
  const existing = (await getDocs(type)).find((doc) => doc.id === id);
  if (!existing) {
    return { ok: false, status: 404, error: `文档不存在：${type}/${id}` };
  }
  if (!existing.ownerBotIds.includes(bot.id)) {
    return { ok: false, status: 403, error: "只能更新该虾上传的文档" };
  }
  if (
    existing.contentState !== "Approved"
    && existing.contentState !== "Needs Attention"
    && existing.contentState !== "Reviewing"
  ) {
    return { ok: false, status: 422, error: "只有已批准、待留意或复盘中的文档才能更新" };
  }

  // 修订锁定原分类（与网页更新一致）：知识沿用原 domain / category / subtype，
  // 技能沿用原 scenario，frontmatter 缺省时回填原值。机器接口无分类选择入口。
  if (existing.type === "knowledge") {
    input.docInput = prefillUpdateDocDomain(input.docInput, existing.domain ?? "");
    input.docInput = prefillUpdateDocTaxonomy(input.docInput, { category: existing.category, subtype: existing.subtype });
  } else {
    input.docInput = prefillUpdateDocScenario(input.docInput, existing.scenario ?? "其他");
  }

  const parsed = docInputSchema.safeParse(input.docInput);
  if (!parsed.success) {
    return { ok: false, status: 422, error: formatZodError(parsed.error) };
  }
  const value = parsed.data;
  if (value.type !== type) {
    return { ok: false, status: 422, error: "上传文件类型与原文档不一致" };
  }

  // 技能修订 id 必须与原文档一致：新包 SKILL.md 的 name（id）不得改变。
  // 知识上传不填 id（系统自动分配），不在此校验。
  if (existing.type === "skills" && value.id !== id) {
    return { ok: false, status: 422, error: "技能修订时包内 SKILL.md 的 name（id）必须与原文档一致" };
  }

  const [docs] = await Promise.all([getDocs()]);
  // 修订 id 恒定（知识与技能均沿用原 id，不随新文件 id/name 改变）。
  const dupBody = findDuplicateDocBody(value.body, docs, id);
  if (dupBody) {
    return { ok: false, status: 422, error: `存在相同文件请重新上传：与已有文档「${dupBody.title}」正文相同` };
  }

  // 修订版本约束：必填 + 格式 + 严格递增。历史旧版本自动归一基线后比较。
  const versionDecision = validateVersionedUpdate(existing.version, value.version);
  if (!versionDecision.ok) {
    return { ok: false, status: 422, error: versionDecision.error };
  }

  // 修订后状态按原状态分流（Reviewing → Needs Review，需 owner 重新审批）。
  const nextContentState = nextDocStateAfterUpdate(existing.contentState);
  const doc: MarkdownDoc = {
    ...existing,
    // 修订 id 恒定：知识与技能均沿用原 id（稳定引用，不随新文件 id/name 改变）。
    id: existing.id,
    title: value.title,
    tags: value.tags,
    updatedAt: new Date().toISOString().slice(0, 10),
    // 修订时刻（带时分）：与 updateDocFromUpload 同款，详情页「更新时间」据此展示。
    revisedAt: new Date().toISOString(),
    // 发布者不变：ownerBotIds（归属虾）沿用原文档。授权已保证 bot ∈ existing.ownerBotIds，
    // 保留后 bot 仍在归属内；authorUserId / createdAt 亦由 ...existing 保留。
    ownerBotIds: existing.ownerBotIds,
    summary: value.summary,
    body: value.body,
    contentState: nextContentState,
    // 批准时间分流：已批准文档修订后仍为已批准，沿用原 approvedAt；待留意 / 复盘中修订后
    // 进入待审核（不再批准），清空 approvedAt，再次审批通过时重新写入。
    // 审批人 approver 同步分流（沿用 / 清空），与 approvedAt 保持一致。
    approvedAt: nextContentState === "Approved" ? existing.approvedAt ?? null : null,
    approver: nextContentState === "Approved" ? existing.approver ?? null : null,
    rejectedAt: null,
    rejector: null,
    rejectionReason: null,
    version: versionDecision.version,
    evidence: value.evidence ?? null,
  };
  const asset = input.asset ? { ...input.asset, docId: doc.id } : null;
  const updated = await replaceDoc(id, doc, asset);
  if (!updated) {
    return { ok: false, status: 404, error: `文档不存在：${type}/${id}` };
  }
  return { ok: true, data: doc };
}

// 文档更新授权（纯函数，便于单测覆盖授权矩阵）。与删除、审批一致：
// 仅发布者本人可更新；管理员无越权；历史/种子文档无 owner，保持只读。
export function canUpdateDoc(
  currentUser: SessionUser | null,
  docAuthorUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (docAuthorUserId !== null && docAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能更新自己发布的文档" };
}

// 文档删除授权（纯函数，便于单测覆盖授权矩阵）。
//   - 未登录：401。
//   - 发布者本人（authorUserId 匹配）：可删自己的文档。
//   - 其余（含管理员越权、无 authorUserId 的历史/种子文档）：403。
// 与删问题帖 / 删回复 / 删虾一致：用户自建内容仅 owner 可删，管理员无越权。
export function canDeleteDoc(
  currentUser: SessionUser | null,
  docAuthorUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (docAuthorUserId !== null && docAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除自己发布的文档" };
}

// 文档审批授权（纯函数）。审批权归发布者本人，或文档归属虾的 owner（虾内容
// authorUserId 置空后靠 ownerBotIds 解析归属）；管理员无越权；无 owner 的
// 历史/种子文档无人可审批。与问题帖审批一致。
// 转审（§ 治理）：reviewTransferredToUserId 非空时审批权已整体转交给被转审人，
// 原 owner / 发布者均不再拥有审批权——只有被转审人可批准 / 驳回。
export function canReviewDoc(
  currentUser: SessionUser | null,
  docAuthorUserId: string | null,
  botOwnerUserIds: Array<string | null> = [],
  reviewTransferredToUserId: string | null = null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (reviewTransferredToUserId !== null) {
    return currentUser.id === reviewTransferredToUserId
      ? { allowed: true }
      : { allowed: false, status: 403, error: "该文档审批权已转交给其他用户，请由被转审人操作" };
  }
  if (docAuthorUserId !== null && docAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  if (botOwnerUserIds.includes(currentUser.id)) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能审批自己发布的文档" };
}

// 虾「我的文档」列表归属判定（纯函数，便于单测覆盖授权边界）。
// mine 列表只返回该虾本人经机器接口发布的文档：ownerBotIds 含本虾 且 authorUserId 为空。
// 「authorUserId 为空」是虾本体发布、而非 Web 用户发布的可靠判据——虾经机器接口发布恒置
// authorUserId=null（route.ts 传 null currentUser，迁移 046 回填存量虾内容），Web 用户
// 发布恒非空。仅看 ownerBotIds 不够：Web 上传路径若信任 frontmatter ownerBotIds（如
// 重传导出的虾文档），会把人发文档混进该虾 mine 列表（泄露），故同时要求 authorUserId
// 为空。与 canReviewDoc 互补：审批权按人或虾 owner 判定，isMineDoc 按虾本体判列表归属。
export function isMineDoc(
  doc: Pick<MarkdownDoc, "ownerBotIds" | "authorUserId">,
  botId: string,
): boolean {
  return doc.authorUserId === null && doc.ownerBotIds.includes(botId);
}

// 解析文档归属虾的 owner 用户 id 数组（供 canReviewDoc / 审批 / 驳回共用）。
// 归属虾不存在或 ownerUserId 为空 → 该项为 null。
async function docOwnerUserIds(docOwnerBotIds: string[]): Promise<Array<string | null>> {
  const bots = await getBots();
  return docOwnerBotIds.map((botId) => bots.find((bot) => bot.id === botId)?.ownerUserId ?? null);
}

// 审批通过：Needs Review / Needs Attention → Approved（知识 / 技能统一）。
// 待留意表示收到评论但不一定需要修订，发布者可直接确认恢复已批准。
// 仅发布者本人可审批（canReviewDoc 把关）；其他状态不可审批，避免重复审批或跨状态越权。
export async function reviewDoc(
  type: MarkdownDoc["type"],
  docId: string,
  currentUser: SessionUser | null,
): Promise<ServiceResult<{ id: string; contentState: ContentState }> | { ok: false; status: number; error: string }> {
  const docs = await getDocs(type);
  const doc = docs.find((item) => item.id === docId);
  if (!doc) {
    return { ok: false, error: `doc not found: ${docId}` };
  }

  const ownerUserIds = await docOwnerUserIds(doc.ownerBotIds);
  const decision = canReviewDoc(currentUser, doc.authorUserId, ownerUserIds, doc.reviewTransferredToUserId ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  if (doc.contentState !== "Needs Review" && doc.contentState !== "Needs Attention") {
    return { ok: false, error: "只有待审核或待留意状态的文档才能审批" };
  }

  const target: ContentState = "Approved";
  // 审批通过写入批准时间 approved_at 与审批人 approver（操作者用户名）；乐观并发
  // where content_state = 原状态。
  const approvedAt = new Date().toISOString();
  const updated = await approveDocState(docId, approvedAt, currentUser!.username, doc.contentState);
  if (!updated) {
    return { ok: false, error: "文档状态已变更，请刷新后重试" };
  }
  return { ok: true, data: { id: docId, contentState: target } };
}

// 驳回：Needs Review → Reviewing。仅发布者本人可操作，理由必填。
export async function rejectDoc(
  type: MarkdownDoc["type"],
  docId: string,
  input: unknown,
  currentUser: SessionUser | null,
): Promise<ServiceResult<{ id: string; contentState: ContentState; rejectedAt: string; rejector: string; rejectionReason: string }> | { ok: false; status: number; error: string }> {
  const parsed = rejectionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const doc = (await getDocs(type)).find((item) => item.id === docId);
  if (!doc) return { ok: false, error: `doc not found: ${docId}` };
  const ownerUserIds = await docOwnerUserIds(doc.ownerBotIds);
  const decision = canReviewDoc(currentUser, doc.authorUserId, ownerUserIds, doc.reviewTransferredToUserId ?? null);
  if (!decision.allowed) return { ok: false, status: decision.status, error: decision.error };
  if (doc.contentState !== "Needs Review") {
    return { ok: false, error: "只有待审核状态的文档才能驳回" };
  }

  const rejectedAt = new Date().toISOString();
  const rejector = currentUser!.username;
  const rejectionReason = parsed.data.reason;
  const updated = await getSql().transaction(async (txn) => {
    const changed = await rejectDocState(docId, rejector, rejectedAt, rejectionReason, "Needs Review", txn);
    if (!changed) return false;
    for (const botId of doc.ownerBotIds) {
      await insertBotDocRejectionNotification({
        botId,
        docId: doc.id,
        docType: doc.type,
        docTitle: doc.title,
        message: rejectionReason,
        rejector: rejector,
        createdAt: rejectedAt,
      }, txn);
      await txn.query("select pg_notify($1, $2)", ["bot_notification", JSON.stringify({ botId })]);
    }
    return true;
  });
  if (!updated) return { ok: false, error: "文档状态已变更，请刷新后重试" };
  return { ok: true, data: { id: docId, contentState: "Reviewing", rejectedAt, rejector, rejectionReason } };
}

// 转审：岗位虾的 owner 把待审核文档的审批权（批准 / 驳回）转交给其他注册用户。
// 仅岗位虾经机器接口上传的 Needs Review 文档可转审；转交后 owner 失去该文档审批权
// （canReviewDoc 只认被转审人），发布者仍为岗位虾本体。转审挂在文档上：被驳回后
// 虾修订回到待审核，审批权仍归被转审人。只能转交一次（已转审后原 owner 无权再转）。
export async function transferDocReview(
  type: MarkdownDoc["type"],
  docId: string,
  input: unknown,
  currentUser: SessionUser | null,
): Promise<ServiceResult<{ id: string; transferredToUserId: string; transferredToUsername: string; transferredAt: string }> | { ok: false; status: number; error: string }> {
  const parsed = docTransferInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  if (!currentUser) return { ok: false, status: 401, error: "请先登录后再操作" };
  const targetUserId = parsed.data.userId;

  const doc = (await getDocs(type)).find((item) => item.id === docId);
  if (!doc) return { ok: false, status: 404, error: `doc not found: ${docId}` };

  if (doc.contentState !== "Needs Review") {
    return { ok: false, error: "只有待审核状态的文档才能转审" };
  }
  // 岗位虾内容判据：虾本体发布（authorUserId 为空 + ownerBotIds 非空），且归属虾全部为岗位虾。
  if (doc.authorUserId !== null || doc.ownerBotIds.length === 0) {
    return { ok: false, error: "只有岗位虾上传的文档才能转审" };
  }
  const bots = await getBots();
  const ownerBots = doc.ownerBotIds.map((botId) => bots.find((bot) => bot.id === botId) ?? null);
  if (ownerBots.some((bot) => bot === null) || ownerBots.some((bot) => bot!.role !== "岗位虾")) {
    return { ok: false, error: "只有岗位虾上传的文档才能转审" };
  }
  // 转交者必须是岗位虾的 owner（与 canReviewDoc 的虾 owner 分支同口径）。
  const ownerUserIds = ownerBots.map((bot) => bot!.ownerUserId);
  if (!ownerUserIds.includes(currentUser.id)) {
    return { ok: false, status: 403, error: "只有岗位虾的主人才能把文档审批权转交给他人" };
  }
  if (doc.reviewTransferredToUserId != null) {
    return { ok: false, status: 409, error: "该文档审批权已转交，不能再次转审" };
  }
  if (targetUserId === currentUser.id) {
    return { ok: false, error: "审批权不能转交给自己" };
  }
  const sql = getSql();
  const targetRows = (await sql`select id, username from users where id = ${targetUserId}`) as Array<{ id: string; username: string }>;
  const target = targetRows[0];
  if (!target) return { ok: false, status: 404, error: "转审对象不存在" };

  const transferredAt = new Date().toISOString();
  // 乐观并发：state 仍为 Needs Review 且未转审过才生效，避免双写竞态。
  const updated = await sql.transaction(async (txn) => {
    const rows = (await txn`update docs set review_transferred_to_user_id = ${target.id}, review_transferred_at = ${transferredAt}, review_transferred_by_user_id = ${currentUser.id} where id = ${docId} and content_state = 'Needs Review' and review_transferred_to_user_id is null returning id`) as Array<{ id: string }>;
    if (rows.length === 0) return null;
    await insertReviewTransferNotification({
      recipientUserId: target.id,
      docId: doc.id,
      createdAt: transferredAt,
    }, txn);
    // 复用 reply_notification 频道：页眉铃铛 SSE 订阅同一频道，被转审人即时收到提醒。
    await txn.query("select pg_notify($1, $2)", ["reply_notification", JSON.stringify({ recipientUserId: target.id })]);
    return rows[0];
  });
  if (!updated) return { ok: false, status: 409, error: "文档状态已变更或审批权已转交，请刷新后重试" };
  return { ok: true, data: { id: docId, transferredToUserId: target.id, transferredToUsername: target.username, transferredAt } };
}
