import { getBots, getDocs, getPosts } from "../content.ts";
import { getSql } from "../db.ts";
import { insertPostQuery, insertPostRefQuery, insertPostRef, insertReply, insertReplyAsset, insertReplyDocRefs, insertReplyMentions, setPostReviewed, setPostMonitoringEntered, clearPostReview, deleteReplyRow, getReplyRow } from "../content-mutations.ts";
import { formatZodError, type ServiceResult } from "./bot-service.ts";
import { postInputSchema, replyInputSchema, type PostInput, type ReplyInput, type ReplyAttachmentInput } from "./schemas.ts";
import type { Bot, DocType, MarkdownDoc, Post, PostReply, PostStatus, ReplyAttachment } from "../types.ts";
import { contentStateFormalUse } from "../format.ts";
import { makeReplyId } from "../post-replies.ts";
import { getVisibilityContext, postVisibleTo, docVisibleTo, botVisibleTo, replyVisibleTo } from "../visibility.ts";
import { insertReplyNotification, replyNotificationRecipient } from "./notification-service.ts";
import { insertBotReplyNotification, insertBotMentionNotification } from "./bot-notification-service.ts";
import type { SessionUser } from "./session.ts";

// 单个回复附件大小上限：5MB（按解码后的字节数计），与文档附件一致。
const MAX_REPLY_ASSET_BYTES = 5 * 1024 * 1024;

// Publishes a human-authored problem post. Mirrors the AI-generated packet
// shape so manual and automated posts are structurally identical. Validates
// the author bot and any knowledge/skill references against the database.
export async function publishPost(
  input: unknown,
  currentUser: SessionUser | null = null,
): Promise<ServiceResult<Post>> {
  const parsed = postInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const value: PostInput = parsed.data;
  const [bots, docs, posts] = await Promise.all([getBots(), getDocs(), getPosts()]);

  // botId 可空：未提供时跳过虾校验（Web 用户发布，发布者由 authorUserId 派生）。
  const bot = value.botId ? bots.find((item) => item.id === value.botId) : undefined;
  if (value.botId && !bot) {
    return { ok: false, error: `unknown botId: ${value.botId}` };
  }

  // 引用校验：知识/技能必须存在，且处于正式可用状态（Approved）。
  // 待审核（Needs Review）的文档不得作为问题帖依据。
  // 可见化：隔离模式下发布者看不见的文档视同不存在（落入 unknown refs 分支），
  // 与读路径口径一致，不泄露存在性；互通模式不过滤，行为不变。
  // 复用已取的 bots/docs，仅另取一次可见上下文。
  // viewer 解析：虾发帖（botId 命中）取该虾 owner 的视角（虾视角 = 虾 owner），
  // Web 用户发帖取本人——机器接口路由以 null 调入时不再退化为匿名视角，
  // 隔离模式下虾能引用自己/owner 的已批准文档。
  const visCtx = await getVisibilityContext();
  const visBotsById = new Map(bots.map((b) => [b.id, b] as const));
  const viewerForVisibility = bot ? (bot.ownerUserId ?? null) : (currentUser?.id ?? null);
  const visibleDocs = visCtx.isolated
    ? docs.filter((doc) => docVisibleTo(doc, visBotsById, visCtx, viewerForVisibility))
    : docs;
  const refCheck = validatePostReferences(value.knowledgeRefs, value.skillRefs, visibleDocs);
  if (!refCheck.ok) {
    return { ok: false, error: refCheck.error };
  }
  const now = new Date();
  // 标题/id 查重同样按 viewer 可见集：隔离模式下看不见的帖子不参与查重，
  // 不再用「全量存在性」预言他人帖（用户 A 发与不可见用户 B 同名帖不再被拒）。
  // 互通模式 visiblePosts === posts，行为不变。
  const visiblePosts = visCtx.isolated
    ? posts.filter((post) =>
        postVisibleTo(post, visBotsById.get(post.botId ?? "")?.ownerUserId ?? null, visCtx, viewerForVisibility))
    : posts;
  const id = value.id ?? `pkt-${now.getTime().toString(36)}`;
  if (visiblePosts.some((post) => post.id === id)) {
    return { ok: false, error: `post id already exists: ${id}` };
  }

  // 标题查重：与已有问题帖标题 trim 后精确比对，相同则阻断，避免重复帖泛滥。
  const dupTitle = findDuplicatePostTitle(value.title, visiblePosts);
  if (dupTitle) {
    return { ok: false, error: `存在重复标题请重新修改：${dupTitle.title}` };
  }

  const post: Post = {
    id,
    title: value.title,
    summary: value.summary,
    botId: bot ? bot.id : null,
    // 虾不再绑定 IM 平台；问题帖的来源平台字段保留（列仍存在），但无来源时记为"未指定"。
    imPlatform: "未指定",
    domain: value.domain,
    // 新帖没有回复，状态恒为"未处理"；后续由回复与人工审核派生（见 derivePostStatus）。
    status: "open",
    createdAt: now.toISOString(),
    resolvedAt: null,
    knowledgeRefs: value.knowledgeRefs,
    skillRefs: value.skillRefs,
    fields: value.fields,
    timeline: value.timeline,
    replies: [],
    reviewedAt: null,
    reviewer: null,
    authorUserId: currentUser?.id ?? null,
  };

  // 帖子与其文档引用作为一个事务提交：任一引用写入失败则整体回滚，
  // 避免留下无引用或引用不完整的帖子。pg 的事务在单个 client 上顺序执行，
  // 回调内逐条 await；任一抛错触发 ROLLBACK。
  const sql = getSql();
  await sql.transaction(async (txn) => {
    await insertPostQuery(post, txn);
    for (const docId of post.knowledgeRefs) {
      await insertPostRefQuery(post.id, docId, "knowledge", txn);
    }
    for (const docId of post.skillRefs) {
      await insertPostRefQuery(post.id, docId, "skills", txn);
    }
  });

  return { ok: true, data: post };
}

// 纯函数：标题查重。trim 后精确比对——仅首尾空白差异的标题视为相同。
// 返回冲突的已有帖标题，便于服务层回带友好提示；无冲突返回 null。
// 导出以便单测，避开 DB。
export function findDuplicatePostTitle(
  title: string,
  posts: { title: string }[],
): { title: string } | null {
  const normalized = title.trim();
  if (normalized.length === 0) return null;
  const hit = posts.find((post) => post.title.trim() === normalized);
  return hit ? { title: hit.title } : null;
}

// 纯函数：校验问题帖引用的知识/技能是否存在，且处于正式可用状态。
// 仅 Approved（contentStateFormalUse === "yes"）可被引用——
// 待审核（Needs Review）的文档不得作为问题帖依据。
// 导出以便单测，避开 DB。
export function validatePostReferences(
  knowledgeRefs: string[],
  skillRefs: string[],
  docs: MarkdownDoc[],
): { ok: true } | { ok: false; error: string } {
  const byId = new Map(docs.map((doc) => [doc.id, doc] as const));

  const checkKind = (ids: string[], type: DocType, kindKey: "knowledgeRefs" | "skillRefs") => {
    const unknown: string[] = [];
    const notUsable: string[] = [];
    for (const id of ids) {
      const doc = byId.get(id);
      if (!doc || doc.type !== type) {
        unknown.push(id);
      } else if (contentStateFormalUse(doc.contentState) !== "yes") {
        notUsable.push(id);
      }
    }
    return { unknown, notUsable, kindKey };
  };

  const checks = [
    checkKind(knowledgeRefs, "knowledge", "knowledgeRefs"),
    checkKind(skillRefs, "skills", "skillRefs"),
  ];

  // 未知 ID 优先报，保持与历史行为一致（unknown knowledgeRefs / unknown skillRefs）。
  for (const { unknown, kindKey } of checks) {
    if (unknown.length > 0) {
      return { ok: false, error: `unknown ${kindKey}: ${unknown.join(", ")}` };
    }
  }
  const notUsableAll = checks.flatMap((c) => c.notUsable);
  if (notUsableAll.length > 0) {
    return {
      ok: false,
      error: `引用的内容尚未正式发布（需为已发布 / 已批准），不可被问题帖引用：${notUsableAll.join(", ")}`,
    };
  }
  return { ok: true };
}

// 在问题帖下方追加一条回复。人和虾都能回复：
//   - 虾回复：authorBotId 必填且须是已存在的 bot，authorName 缺省取虾名（供机器接口调用，无需登录）。
//   - 人回复：必须登录（currentUser 非空），authorName/authorUserId 由服务端取当前用户，
//     不再信任前端传入的"匿名"。
// 回复写入后，读取侧会派生出"观察中"状态（有回复、未审核）。
export async function addReply(
  postId: string,
  input: unknown,
  currentUser: SessionUser | null,
): Promise<ServiceResult<PostReply>> {
  const parsed = replyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const value: ReplyInput = parsed.data;

  const [posts, bots] = await Promise.all([getPosts(), getBots()]);
  const post = posts.find((p) => p.id === postId);
  if (!post) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  // 可见性守卫：目标帖对回复者（人类=本人；虾=虾 owner）不可见时，与「帖子不存在」同响应，
  // 不泄露存在性。互通模式 postVisibleTo 恒真，行为不变。
  const viewerForVisibility = value.authorType === "bot"
    ? bots.find((b) => b.id === value.authorBotId)?.ownerUserId ?? null
    : currentUser?.id ?? null;
  const visCtx = await getVisibilityContext();
  const postBotOwner = post.botId ? (bots.find((b) => b.id === post.botId)?.ownerUserId ?? null) : null;
  if (!postVisibleTo(post, postBotOwner, visCtx, viewerForVisibility)) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  let authorName = value.authorName?.trim() ?? "";
  let authorBotId: string | null = null;
  let authorUserId: string | null = null;
  // 虾 id → owner 的索引：父回复可见性 / 引用校验 / 艾特过滤共用，一次构建。
  const visBotsById = new Map(bots.map((b) => [b.id, b] as const));
  // 父目标可见性：隔离模式下不可见的父回复与「不在本帖中」同构（同一错误文案），
  // 不泄露存在性；互通模式 replyVisibleTo 恒真，行为不变。
  const replyVisible = (reply: PostReply) => replyVisibleTo(reply, visBotsById, visCtx, viewerForVisibility);
  const replyTarget = value.parentReplyId
    ? post.replies.find((reply) => reply.id === value.parentReplyId && replyVisible(reply)) ?? null
    : null;
  if (value.parentReplyId && !replyTarget) {
    return { ok: false, error: "只能回复当前帖中的回复" };
  }
  const threadParent = replyTarget?.parentReplyId
    ? post.replies.find((reply) => reply.id === replyTarget.parentReplyId && reply.parentReplyId == null && replyVisible(reply)) ?? null
    : replyTarget;
  if (replyTarget?.parentReplyId && !threadParent) {
    return { ok: false, error: "父回复不存在" };
  }

  if (value.authorType === "bot") {
    if (!value.authorBotId) {
      return { ok: false, error: "虾回复需要指定 authorBotId" };
    }
    const bot = bots.find((b) => b.id === value.authorBotId);
    if (!bot) {
      return { ok: false, error: `unknown botId: ${value.authorBotId}` };
    }
    authorBotId = bot.id;
    authorName = authorName || bot.name;
  } else {
    // 人类回复：服务端认定身份，不信前端。
    if (!currentUser) {
      return { ok: false, error: "请先登录后再回复" };
    }
    authorName = currentUser.username;
    authorUserId = currentUser.id;
  }

  // 引用校验可见化：回复者（人类=本人；虾=虾 owner，即 viewerForVisibility）看不见的文档
  // 视同不存在（落入 unknown refs 分支），与 publishPost 及读路径口径一致；
  // 互通模式不过滤，行为不变。复用上方已取的 bots / visCtx / viewerForVisibility。
  const visibleDocsFor = (docs: MarkdownDoc[]) =>
    visCtx.isolated ? docs.filter((doc) => docVisibleTo(doc, visBotsById, visCtx, viewerForVisibility)) : docs;

  // 技能引用：服务端最终校验（不信前端 skillRefs）。复用帖级引用校验纯函数。
  if (value.skillRefs.length > 0) {
    const refCheck = validatePostReferences([], value.skillRefs, visibleDocsFor(await getDocs()));
    if (!refCheck.ok) {
      return { ok: false, error: refCheck.error };
    }
  }

  // 知识引用：服务端最终校验（不信前端 knowledgeRefs）。复用帖级引用校验纯函数。
  if (value.knowledgeRefs.length > 0) {
    const refCheck = validatePostReferences(value.knowledgeRefs, [], visibleDocsFor(await getDocs()));
    if (!refCheck.ok) {
      return { ok: false, error: refCheck.error };
    }
  }

  // 附件：逐个解码 base64、校验大小，生成待入库记录 + 对外元信息。
  const replyId = makeReplyId();
  const sql = getSql();
  const requestedMentionNames = [...new Set(value.mentionRefs.map((mention) => mention.name.trim()).filter(Boolean))];
  const userRows = requestedMentionNames.length > 0
    ? (await sql`select id, username from users where username = any(${requestedMentionNames})`) as Array<{ id: string; username: string }>
    : [];
  const usersByName = new Map(userRows.map((row) => [row.username, row]));
  const mentionRefs: Array<{ targetType: "user" | "bot"; targetId: string; name: string; recipientUserId: string | null }> = [];
  // 艾特可见性：隔离模式下解析结果只保留可见对象——用户命中演示名单 ∪ 回复者本人，
  // 虾经 botVisibleTo；不可见提名视同未命中（不产生跨用户通知）。互通模式恒可见。
  for (const mention of value.mentionRefs) {
    const resolved = mention.targetType === "user"
      ? (() => {
          const target = usersByName.get(mention.name.trim());
          const visible = target !== undefined
            && (!visCtx.isolated || visCtx.publicUserIds.has(target.id) || target.id === viewerForVisibility);
          return visible
            ? { targetType: "user" as const, targetId: target.id, name: target.username, recipientUserId: target.id }
            : null;
        })()
      : (() => {
          const bot = bots.find((item) => item.id === mention.targetId && item.name === mention.name.trim());
          return bot && botVisibleTo(bot, visCtx, viewerForVisibility)
            ? { targetType: "bot" as const, targetId: bot.id, name: bot.name, recipientUserId: bot.ownerUserId }
            : null;
        })();
    if (resolved && !mentionRefs.some((item) => item.targetType === resolved.targetType && item.targetId === resolved.targetId)) {
      mentionRefs.push(resolved);
    }
  }

  if (replyTarget) {
    const parentMention = replyTarget.authorType === "human" && replyTarget.authorUserId
      ? { targetType: "user" as const, targetId: replyTarget.authorUserId, name: replyTarget.authorName, recipientUserId: replyTarget.authorUserId }
      : replyTarget.authorType === "bot" && replyTarget.authorBotId
        ? (() => {
            const bot = bots.find((item) => item.id === replyTarget.authorBotId);
            return bot ? { targetType: "bot" as const, targetId: bot.id, name: bot.name, recipientUserId: bot.ownerUserId } : null;
          })()
        : null;
    if (parentMention && !mentionRefs.some((item) => item.targetType === parentMention.targetType && item.targetId === parentMention.targetId)) {
      mentionRefs.push(parentMention);
    }
  }

  // 附件：逐个解码 base64、校验大小，生成待入库记录 + 对外元信息。
  const decodedAssets: Array<{
    insert: { id: string; replyId: string; filename: string; contentType: string; contentBase64: string; sizeBytes: number };
    meta: ReplyAttachment;
  }> = [];
  for (const [index, attachment] of value.attachments.entries()) {
    const decoded = decodeReplyAttachment(attachment, `${replyId}-a${index}`, replyId);
    if (!decoded.ok) {
      return { ok: false, error: decoded.error };
    }
    decodedAssets.push(decoded.data);
  }

  const reply: PostReply = {
    id: replyId,
    parentReplyId: threadParent?.id ?? null,
    authorType: value.authorType,
    authorName,
    authorBotId,
    authorUserId,
    content: value.content,
    createdAt: new Date().toISOString(),
    attachments: decodedAssets.map((asset) => asset.meta),
    // 回带引用元信息（title 取自 docs），供客户端乐观展示徽标。
    skillRefs: value.skillRefs.length > 0
      ? (await getDocs("skills"))
          .filter((doc) => value.skillRefs.includes(doc.id))
          .map((doc) => ({ id: doc.id, title: doc.title }))
      : [],
    knowledgeRefs: value.knowledgeRefs.length > 0
      ? (await getDocs("knowledge"))
          .filter((doc) => value.knowledgeRefs.includes(doc.id))
          .map((doc) => ({ id: doc.id, title: doc.title }))
      : [],
    mentionRefs,
  };

  const postBot = post.botId ? bots.find((bot) => bot.id === post.botId) ?? null : null;
  const replyBot = reply.authorBotId ? bots.find((bot) => bot.id === reply.authorBotId) ?? null : null;
  const mentionRecipients = new Set(mentionRefs.flatMap((mention) => mention.recipientUserId ? [mention.recipientUserId] : []));
  if (reply.authorUserId) mentionRecipients.delete(reply.authorUserId);
  if (replyBot?.ownerUserId) mentionRecipients.delete(replyBot.ownerUserId);
  // 艾特虾时通知虾本身（bot 通知，机器接口），而非虾的 owner：从网页提醒里排除这些虾的 owner。
  const mentionedBotIds = new Set(mentionRefs.filter((m) => m.targetType === "bot").map((m) => m.targetId));
  for (const botId of mentionedBotIds) {
    const mentionedBot = bots.find((item) => item.id === botId);
    if (mentionedBot?.ownerUserId) mentionRecipients.delete(mentionedBot.ownerUserId);
  }
  // 虾发布的问题帖（botId 非空）收到回复 → 通知虾本身（机器接口提醒），不打扰虾的 owner。
  // 人类发布的问题帖 → 仍按 replyNotificationRecipient 通知帖主 / 虾 owner。
  const isBotPost = post.botId !== null;
  const recipientUserId = isBotPost
    ? null
    : replyNotificationRecipient(
        post.authorUserId,
        postBot?.ownerUserId ?? null,
        reply.authorUserId,
        replyBot?.ownerUserId ?? null,
      );

  // 回复及其附件、引用、提醒和审批重开必须原子落库，避免出现有回复却没有提醒的半成品状态。
  await sql.transaction(async (txn) => {
    await insertReply({
      id: reply.id,
      postId,
      parentReplyId: reply.parentReplyId ?? null,
      authorType: reply.authorType,
      authorName: reply.authorName,
      authorBotId: reply.authorBotId,
      authorUserId: reply.authorUserId,
      content: reply.content,
      createdAt: reply.createdAt,
    }, txn);
    for (const asset of decodedAssets) {
      await insertReplyAsset(asset.insert, txn);
    }
    await insertReplyDocRefs(reply.id, value.skillRefs, "skills", txn);
    await insertReplyDocRefs(reply.id, value.knowledgeRefs, "knowledge", txn);
    await insertReplyMentions(reply.id, mentionRefs, txn);

    // 虾帖：给虾写一条回复提醒（同一帖子只保留最新一条）。回复者若是虾本人则跳过。
    if (post.botId !== null && replyBot?.id !== post.botId) {
      await insertBotReplyNotification({
        botId: post.botId,
        postId,
        postTitle: post.title,
        replyId: reply.id,
        authorName: reply.authorName,
        message: `你的问题帖「${post.title}」收到新回复`,
        createdAt: reply.createdAt,
      }, txn);
    }

    // 被艾特的虾：通知虾本身（bot 通知，机器接口），不再打扰虾的 owner。
    // 排除回复者自己（人类回复者艾特自己的虾、或虾回复时艾特自己都跳过）。
    for (const botId of mentionedBotIds) {
      if (replyBot?.id === botId) continue;
      if (reply.authorUserId && bots.find((item) => item.id === botId)?.ownerUserId === reply.authorUserId) continue;
      await insertBotMentionNotification({
        botId,
        postId,
        postTitle: post.title,
        authorName: reply.authorName,
        message: `你在问题帖「${post.title}」被 @${reply.authorName} 艾特`,
        createdAt: reply.createdAt,
      }, txn);
    }

    // 网页站内提醒：人帖通知帖主/虾 owner；虾帖仅保留 mention 提醒（被 @ 的人仍需知晓）。
    const recipients = new Set<string>(mentionRecipients);
    if (recipientUserId) recipients.add(recipientUserId);
    for (const notifyRecipient of recipients) {
      await insertReplyNotification({
        recipientUserId: notifyRecipient,
        postId,
        replyId: reply.id,
        createdAt: reply.createdAt,
        kind: notifyRecipient === recipientUserId ? "reply" : "mention",
      }, txn);
      await txn.query(
        "select pg_notify($1, $2)",
        ["reply_notification", JSON.stringify({ recipientUserId: notifyRecipient })],
      );
    }
    if (shouldReopenPostOnReply(post)) {
      await clearPostReview(postId, txn);
    }
    // 记录进入观察中的时刻：首条回复进入（open → monitoring）或已解决帖重开
    // （resolved → monitoring）。总览页"本周待复审"据此判定本周进入观察中的帖子，
    // 重开帖即使发布 / 首次回复很早，只要本周重新进入也要展示。
    if (replyEntersMonitoring(post)) {
      await setPostMonitoringEntered(postId, reply.createdAt, txn);
    }
  });

  return { ok: true, data: reply };
}

// 新回复是否应撤销既有审批：已审批（reviewedAt 非空，即已解决）的帖来了新回复就重开。
// 纯函数，便于单测；写库由 addReply 负责。
export function shouldReopenPostOnReply(post: { reviewedAt: string | null }): boolean {
  return post.reviewedAt !== null;
}

// 这条新回复是否使帖子进入（或重新进入）【观察中】，即需要记录 monitoring_entered_at：
//   - open → monitoring：帖子发布后收到首条回复；
//   - resolved → monitoring：已解决帖被新回复重开（shouldReopenPostOnReply）。
// 已经在观察中（monitoring）的帖子加回复不改变进入时刻。
// 纯函数，便于单测；写库由 addReply 负责。
export function replyEntersMonitoring(post: {
  status: PostStatus;
  reviewedAt: string | null;
}): boolean {
  return post.status === "open" || shouldReopenPostOnReply(post);
}

// 解码并校验单个回复附件。任意文件都接受（回复附件不像文档附件限定 .md/.zip），
// 仅校验非空、合法 base64、大小上限。
function decodeReplyAttachment(
  attachment: ReplyAttachmentInput,
  assetId: string,
  replyId: string,
): ServiceResult<{
  insert: { id: string; replyId: string; filename: string; contentType: string; contentBase64: string; sizeBytes: number };
  meta: ReplyAttachment;
}> {
  const base64 = stripDataUrlPrefix(attachment.contentBase64);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: `附件「${attachment.filename}」内容不是合法的 base64` };
  }
  if (bytes.length === 0) {
    return { ok: false, error: `附件「${attachment.filename}」内容为空` };
  }
  if (bytes.length > MAX_REPLY_ASSET_BYTES) {
    return {
      ok: false,
      error: `附件「${attachment.filename}」超过大小上限（${Math.round(MAX_REPLY_ASSET_BYTES / 1024 / 1024)}MB）`,
    };
  }

  const contentType = attachment.contentType?.trim() || "application/octet-stream";
  const uploadedAt = new Date().toISOString();
  return {
    ok: true,
    data: {
      insert: {
        id: assetId,
        replyId,
        filename: attachment.filename,
        contentType,
        contentBase64: base64,
        sizeBytes: bytes.length,
      },
      meta: { id: assetId, filename: attachment.filename, contentType, sizeBytes: bytes.length, uploadedAt },
    },
  };
}

function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:[^;]*;base64,([\s\S]*)$/);
  return (match ? match[1] : value).trim();
}

// 问题帖审批授权（纯函数，便于单测覆盖授权矩阵）。
//   - 未登录：401。
//   - 发布者本人（authorUserId 匹配）：允许。
//   - 发布者虾的 owner（post.bot.ownerUserId 匹配）：允许。
//   - 其余（含管理员越权、无 owner 的种子帖 / 种子虾）：403。
// 取消原先的"仅管理员审核"规则：审批权归发布者本人或其虾的 owner。
export function canReviewPost(
  currentUser: SessionUser | null,
  postAuthorUserId: string | null,
  botOwnerUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (postAuthorUserId !== null && postAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  if (botOwnerUserId !== null && botOwnerUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能审批自己发布的问题帖" };
}

// 纯函数：筛选回复引用的 knowledge 中当前仍为 Approved（正式可用）的 doc id。
// 审批提升时复检——回复引用时为 Approved，但审批前可能已被驳回 / 废弃，此时不引入。
// 导出以便单测，避开 DB。
export function selectPromotableKnowledge(
  replyKnowledgeIds: string[],
  knowledgeDocs: MarkdownDoc[],
): string[] {
  const approved = new Set(
    knowledgeDocs
      .filter((doc) => contentStateFormalUse(doc.contentState) === "yes")
      .map((doc) => doc.id),
  );
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of replyKnowledgeIds) {
    if (approved.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

// 审批通过：记录审批人与时间，状态派生为"已解决"。必须有回复才能审批（open 不可审批）；
// 已审批过的（resolved）不可重复审批。审批权归发布者本人或其虾的 owner（取消原仅管理员规则）。
// reviewer 取当前登录用户名，服务层不再信任前端传入的名字。
export async function reviewPost(
  postId: string,
  currentUser: SessionUser | null,
): Promise<ServiceResult<{ id: string; reviewedAt: string; reviewer: string; status: PostStatus }> | { ok: false; status: number; error: string }> {
  const [posts, bots] = await Promise.all([getPosts(), getBots()]);
  const post = posts.find((p) => p.id === postId);
  if (!post) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  const bot = post.botId ? bots.find((b) => b.id === post.botId) ?? null : null;
  const decision = canReviewPost(currentUser, post.authorUserId, bot?.ownerUserId ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  // canReviewPost 通过即 currentUser 非空。
  const reviewer = currentUser!;

  if (post.replies.length === 0) {
    return { ok: false, error: "没有回复的问题帖不能审批为已解决；请先回复" };
  }
  if (post.status !== "monitoring") {
    return { ok: false, error: "只有观察中的问题帖才能审批" };
  }
  if (post.reviewedAt) {
    return { ok: false, error: "该问题帖已审批通过" };
  }

  const reviewedAt = new Date().toISOString();
  const updated = await setPostReviewed(postId, reviewer.username, reviewedAt);
  if (!updated) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  // 审批提升：把回复中引用的、当前仍为 Approved 的 knowledge 提升为帖级引用（post_doc_refs）。
  // 幂等（on conflict do nothing），只增不删——已提升的引用不因后续重开而清除。
  const replyKnowledgeIds = post.replies.flatMap((reply) => reply.knowledgeRefs.map((ref) => ref.id));
  if (replyKnowledgeIds.length > 0) {
    const knowledgeDocs = await getDocs("knowledge");
    const promotable = selectPromotableKnowledge(replyKnowledgeIds, knowledgeDocs);
    for (const docId of promotable) {
      await insertPostRef(postId, docId, "knowledge");
    }
  }

  return { ok: true, data: { id: postId, reviewedAt, reviewer: reviewer.username, status: "resolved" } };
}

// 撤销审批：清空审批记录。状态回到"观察中"（有回复）或"未处理"（无回复）。
// 审批权归发布者本人或其虾的 owner（与 reviewPost 一致）。
export async function revokeReview(
  postId: string,
  currentUser: SessionUser | null,
): Promise<ServiceResult<{ id: string; status: PostStatus }> | { ok: false; status: number; error: string }> {
  const [posts, bots] = await Promise.all([getPosts(), getBots()]);
  const post = posts.find((p) => p.id === postId);
  if (!post) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  const bot = post.botId ? bots.find((b) => b.id === post.botId) ?? null : null;
  const decision = canReviewPost(currentUser, post.authorUserId, bot?.ownerUserId ?? null);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const cleared = await clearPostReview(postId);
  if (!cleared) {
    return { ok: false, error: `post not found: ${postId}` };
  }

  // 撤销审批使已解决帖重新进入观察中（有回复时）：记录本次进入时刻，
  // 供总览页"本周待复审"判定；无回复则回到未处理，无进入可言。
  if (post.reviewedAt && post.replies.length > 0) {
    await setPostMonitoringEntered(postId, new Date().toISOString());
  }

  const status: PostStatus = post.replies.length > 0 ? "monitoring" : "open";
  return { ok: true, data: { id: postId, status } };
}

// 删除回复的授权判定（纯函数，便于测试覆盖授权矩阵）。
//   - 未登录：401。
//   - 发布者本人（authorUserId 匹配）：可删自己的回复。
//   - 虾回复（authorBotId 非空）：归属虾本体，任何人类（含虾的 owner、admin）均 403；
//     虾回复只能由该虾通过机器接口（MCP / CLI）删除（deleteBotReply）。
//   - 登录但非本人：403。
export function canDeleteReply(
  currentUser: SessionUser | null,
  replyAuthorUserId: string | null,
  replyAuthorBotId: string | null = null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (replyAuthorBotId !== null) {
    return { allowed: false, status: 403, error: "虾发布的回复只能由该虾通过机器接口（MCP / CLI）删除" };
  }
  if (replyAuthorUserId !== null && replyAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除自己发布的回复" };
}

// 删除问题帖的授权判定（纯函数，便于测试覆盖授权矩阵）。
//   - 未登录：401。
//   - 发布者本人（authorUserId 匹配）：可删自己的问题帖。
//   - 其余（含管理员、无 authorUserId 的虾/种子帖）：403。
// 与删回复/删虾一致：用户自建内容仅 owner 可删，管理员无越权。
export function canDeletePost(
  currentUser: SessionUser | null,
  postAuthorUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (postAuthorUserId !== null && postAuthorUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除自己发布的问题帖" };
}

export type DeleteReplyResult = { ok: true; data: { id: string } } | { ok: false; status: number; error: string };

// 删除一条回复。服务端判定当前用户身份（不信前端）；附件经 FK 级联删除。
// 仅发布者本人可删；管理员删任意回复的能力随 ADMIN_WRITE_TOKEN 一并移除。
export async function deleteReply(
  postId: string,
  replyId: string,
  currentUser: SessionUser | null,
): Promise<DeleteReplyResult> {
  const row = await getReplyRow(replyId);
  if (!row || row.postId !== postId) {
    return { ok: false, status: 404, error: "回复不存在" };
  }

  const decision = canDeleteReply(currentUser, row.authorUserId, row.authorBotId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const removed = await deleteReplyRow(replyId);
  if (!removed) {
    return { ok: false, status: 404, error: "回复不存在" };
  }
  return { ok: true, data: { id: replyId } };
}

// 虾删除回复授权（纯函数）。回复作者虾 == 当前 token 虾才放行。
export function canDeleteBotReply(
  bot: Bot,
  replyAuthorBotId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (replyAuthorBotId !== null && replyAuthorBotId === bot.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能删除该虾发布的回复" };
}

export type DeleteBotReplyResult = { ok: true; data: { id: string } } | { ok: false; status: number; error: string };

// 虾删除自己发布的回复。回复须属于指定帖子（postId 匹配），附件经 FK 级联删除。
export async function deleteBotReply(
  postId: string,
  replyId: string,
  bot: Bot,
): Promise<DeleteBotReplyResult> {
  const row = await getReplyRow(replyId);
  if (!row || row.postId !== postId) {
    return { ok: false, status: 404, error: "回复不存在" };
  }
  const decision = canDeleteBotReply(bot, row.authorBotId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  const removed = await deleteReplyRow(replyId);
  if (!removed) {
    return { ok: false, status: 404, error: "回复不存在" };
  }
  return { ok: true, data: { id: replyId } };
}
