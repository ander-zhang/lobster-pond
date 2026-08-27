import { getSql, getOptionalSql, type Sql } from "./db.ts";
import type { Bot, DocAsset, DocType, MarkdownDoc, Post } from "./types";

export async function insertBot(bot: Bot) {
  const sql = getSql();
  await sql`
    insert into bots (
      id, name, role, master, summary, domains, owner_user_id, version, model
    )
    values (
      ${bot.id}, ${bot.name}, ${bot.role}, ${bot.master}, ${bot.summary},
      ${JSON.stringify(bot.domains)}::jsonb, ${bot.ownerUserId ?? null},
      ${bot.version}, ${bot.model}
    )
    on conflict (id) do update set
      name = excluded.name,
      role = excluded.role,
      master = excluded.master,
      summary = excluded.summary,
      domains = excluded.domains,
      version = excluded.version,
      model = excluded.model
  `;
}

// 构造插入帖子的查询（不执行）。事务回调里用 txn 逐条 await 执行；
// 单独 await 时用顶层连接（Sql 的调用签名与事务内一致）。
export function insertPostQuery(
  post: Post,
  sql: Sql,
) {
  return sql`
    insert into posts (
      id, title, summary, bot_id, im_platform, domain, status,
      created_at, resolved_at, fields, timeline, author_user_id
    )
    values (
      ${post.id}, ${post.title}, ${post.summary}, ${post.botId}, ${post.imPlatform},
      ${post.domain}, ${post.status}, ${post.createdAt}, ${post.resolvedAt},
      ${JSON.stringify(post.fields)}::jsonb, ${JSON.stringify(post.timeline)}::jsonb,
      ${post.authorUserId ?? null}
    )
    on conflict (id) do nothing
  `;
}

export function insertPostRefQuery(
  postId: string,
  docId: string,
  docType: DocType,
  sql: Sql,
) {
  return sql`
    insert into post_doc_refs (post_id, doc_id, doc_type)
    values (${postId}, ${docId}, ${docType})
    on conflict do nothing
  `;
}

// 单条写入帖子的便捷封装（非事务）。事务内请用 insertPostQuery。
export async function insertPost(post: Post) {
  await insertPostQuery(post, getSql());
}

export async function insertPostRef(postId: string, docId: string, docType: DocType) {
  await insertPostRefQuery(postId, docId, docType, getSql());
}

export async function insertDocQuery(doc: MarkdownDoc, sql: Sql) {
  const domain = doc.type === "knowledge" ? doc.domain : null;
  const category = doc.type === "knowledge" ? doc.category : null;
  const subtype = doc.type === "knowledge" ? doc.subtype : null;
  const scenario = doc.type === "skills" ? doc.scenario : null;
  await sql`
    insert into docs (
      id, doc_type, title, tags, domain, category, subtype, scenario, updated_at, owner_bot_ids, summary, body,
      content_state, version, evidence,
      author_user_id, created_at, revised_at, rejected_at, rejector, rejection_reason, approved_at, approver,
      review_transferred_to_user_id, review_transferred_at, review_transferred_by_user_id
    )
    values (
      ${doc.id}, ${doc.type}, ${doc.title}, ${JSON.stringify(doc.tags)}::jsonb, ${domain},
      ${category}, ${subtype}, ${scenario},
      ${doc.updatedAt}, ${JSON.stringify(doc.ownerBotIds)}::jsonb, ${doc.summary}, ${doc.body},
      ${doc.contentState}, ${doc.version}, ${doc.evidence},
      ${doc.authorUserId ?? null}, coalesce(${doc.createdAt ?? null}::timestamptz, now()),
      ${doc.revisedAt ?? null},
      ${doc.rejectedAt ?? null}, ${doc.rejector ?? null}, ${doc.rejectionReason ?? null}, ${doc.approvedAt ?? null},
      ${doc.approver ?? null},
      ${doc.reviewTransferredToUserId ?? null}, ${doc.reviewTransferredAt ?? null}, ${doc.reviewTransferredByUserId ?? null}
    )
    on conflict (id) do update set
      doc_type = excluded.doc_type,
      title = excluded.title,
      tags = excluded.tags,
      domain = excluded.domain,
      category = excluded.category,
      subtype = excluded.subtype,
      scenario = excluded.scenario,
      updated_at = excluded.updated_at,
      owner_bot_ids = excluded.owner_bot_ids,
      summary = excluded.summary,
      body = excluded.body,
      content_state = excluded.content_state,
      version = excluded.version,
      evidence = excluded.evidence,
      approved_at = excluded.approved_at,
      approver = excluded.approver,
      review_transferred_to_user_id = excluded.review_transferred_to_user_id,
      review_transferred_at = excluded.review_transferred_at,
      review_transferred_by_user_id = excluded.review_transferred_by_user_id
  `;
}

export async function insertDoc(doc: MarkdownDoc) {
  await insertDocQuery(doc, getSql());
}

// 用新上传文件覆盖文档内容。允许主键改为新文件 id，并在同一事务中迁移全部引用、
// 下载计数、评论、评论提醒、附件和全部引用关系；author_user_id/created_at 保持不变。
export async function replaceDoc(
  currentId: string,
  doc: MarkdownDoc,
  asset: Omit<DocAsset, "uploadedAt"> | null,
): Promise<boolean> {
  const sql = getSql();
  return sql.transaction(async (txn) => {
    const exists = (await txn`
      select id from docs where id = ${currentId} and doc_type = ${doc.type}
    `) as Array<{ id: string }>;
    if (exists.length === 0) return false;

    // 外键未配置 ON UPDATE CASCADE：先暂存依赖数据，删旧文档后以新 id 重建。
    const postRefs = (await txn`select post_id, doc_type from post_doc_refs where doc_id = ${currentId}`) as Array<{ post_id: string; doc_type: DocType }>;
    const replyRefs = (await txn`select reply_id, doc_type from reply_doc_refs where doc_id = ${currentId}`) as Array<{ reply_id: string; doc_type: DocType }>;
    const downloadRows = (await txn`select count from doc_download_counts where doc_id = ${currentId}`) as Array<{ count: number }>;
    const commentRows = (await txn`
      select id, parent_comment_id, author_type, author_user_id, author_bot_id, content, created_at from doc_comments where doc_id = ${currentId}
    `) as Array<{ id: string; parent_comment_id: string | null; author_type: "human" | "bot"; author_user_id: string; author_bot_id: string | null; content: string; created_at: string }>;
    const commentMentions = (await txn`
      select m.comment_id, m.target_type, m.target_id, m.target_name, m.recipient_user_id from doc_comment_mentions m join doc_comments c on c.id = m.comment_id where c.doc_id = ${currentId}
    `) as Array<{ comment_id: string; target_type: "user" | "bot"; target_id: string; target_name: string; recipient_user_id: string | null }>;
    const commentNotifications = (await txn`
      select id, recipient_user_id, comment_id, kind, created_at, read_at from doc_comment_notifications where doc_id = ${currentId}
    `) as Array<{ id: string; recipient_user_id: string; comment_id: string; kind: "comment" | "mention"; created_at: string; read_at: string | null }>;
    const transferNotifications = (await txn`
      select id, recipient_user_id, kind, created_at, read_at from doc_review_transfer_notifications where doc_id = ${currentId}
    `) as Array<{ id: string; recipient_user_id: string; kind: string; created_at: string; read_at: string | null }>;
    const oldAssets = (await txn`
      select doc_type, filename, content_type, content_base64, size_bytes
      from doc_assets where doc_id = ${currentId}
    `) as Array<{
      doc_type: DocType;
      filename: string;
      content_type: string;
      content_base64: string;
      size_bytes: number;
    }>;

    await txn`delete from docs where id = ${currentId}`;
    await insertDocQuery(doc, txn);

    for (const ref of postRefs) {
      await txn`insert into post_doc_refs (post_id, doc_id, doc_type) values (${ref.post_id}, ${doc.id}, ${ref.doc_type}) on conflict do nothing`;
    }
    for (const ref of replyRefs) {
      await txn`insert into reply_doc_refs (reply_id, doc_id, doc_type) values (${ref.reply_id}, ${doc.id}, ${ref.doc_type}) on conflict do nothing`;
    }
    if (downloadRows[0]) {
      await txn`insert into doc_download_counts (doc_id, count) values (${doc.id}, ${downloadRows[0].count})`;
    }
    for (const comment of commentRows) {
      await txn`
        insert into doc_comments (id, doc_id, parent_comment_id, author_type, author_user_id, author_bot_id, content, created_at)
        values (${comment.id}, ${doc.id}, ${comment.parent_comment_id}, ${comment.author_type}, ${comment.author_user_id}, ${comment.author_bot_id}, ${comment.content}, ${comment.created_at}::timestamptz)
      `;
    }

    for (const mention of commentMentions) {
      await txn`insert into doc_comment_mentions (comment_id, target_type, target_id, target_name, recipient_user_id) values (${mention.comment_id}, ${mention.target_type}, ${mention.target_id}, ${mention.target_name}, ${mention.recipient_user_id})`;
    }
    for (const notification of commentNotifications) {
      await txn`insert into doc_comment_notifications (id, recipient_user_id, doc_id, comment_id, kind, created_at, read_at) values (${notification.id}, ${notification.recipient_user_id}, ${doc.id}, ${notification.comment_id}, ${notification.kind}, ${notification.created_at}::timestamptz, ${notification.read_at}::timestamptz)`;
    }

    // 转审提醒随 docs 行级联删除，暂存后以新 id 重建（转审关系挂在文档上，
    // 修订不清空转审，被转审人的铃铛提醒也不应随修订消失）。
    for (const transfer of transferNotifications) {
      await txn`insert into doc_review_transfer_notifications (id, recipient_user_id, doc_id, kind, created_at, read_at) values (${transfer.id}, ${transfer.recipient_user_id}, ${doc.id}, ${transfer.kind}, ${transfer.created_at}::timestamptz, ${transfer.read_at}::timestamptz)`;
    }

    const persistedAsset = asset ?? (oldAssets[0]
      ? {
          docId: doc.id,
          docType: oldAssets[0].doc_type,
          filename: oldAssets[0].filename,
          contentType: oldAssets[0].content_type,
          contentBase64: oldAssets[0].content_base64,
          sizeBytes: oldAssets[0].size_bytes,
        }
      : null);
    if (persistedAsset) {
      await upsertDocAssetQuery({ ...persistedAsset, docId: doc.id }, txn);
    }
    return true;
  });
}

// 审批通过：content_state → Approved，并记录批准时间 approved_at（审批通过时刻）与
// 审批人 approver（执行"审批通过"操作的用户名，与 rejector 对称）。
// 仅 reviewDoc 调用；与 rejectDocState 对称。乐观并发：where content_state = expectedState，
// 状态已变（如被驳回 / 被评论改 Needs Attention）则返回 false，调用方提示刷新重试。
export async function approveDocState(
  id: string,
  approvedAt: string,
  approver: string,
  expectedState: string,
  sql: Sql = getSql(),
): Promise<boolean> {
  const rows = (await sql`
    update docs set content_state = 'Approved', approved_at = ${approvedAt}, approver = ${approver}
    where id = ${id} and content_state = ${expectedState}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function rejectDocState(
  id: string,
  rejector: string,
  rejectedAt: string,
  reason: string,
  expectedState: string = "Needs Review",
  sql: Sql = getSql(),
): Promise<boolean> {
  const rows = (await sql`
    update docs set
      content_state = 'Reviewing', rejected_at = ${rejectedAt}, rejector = ${rejector}, rejection_reason = ${reason}
    where id = ${id} and content_state = ${expectedState}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// --- Deletes -------------------------------------------------------------
// Each returns true when a row was actually removed, false when the id wasn't
// found. Business rules (dependency checks, cascade decisions) live in the
// service layer; these are the raw row operations.

export async function deletePostRow(id: string): Promise<boolean> {
  const sql = getSql();
  // Remove this post's own ref rows first, then the post. (The FK on
  // post_doc_refs.post_id is ON DELETE CASCADE, but deleting explicitly keeps
  // the intent obvious and works regardless of constraint definition.)
  await sql`delete from post_doc_refs where post_id = ${id}`;
  const rows = (await sql`delete from posts where id = ${id} returning id`) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function deleteDocRow(id: string): Promise<boolean> {
  const sql = getSql();
  // post_doc_refs.doc_id is ON DELETE CASCADE, so referencing rows are cleared
  // automatically — the citing posts simply lose this reference.
  const rows = (await sql`delete from docs where id = ${id} returning id`) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function deleteBotRow(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`delete from bots where id = ${id} returning id`) as Array<{ id: string }>;
  return rows.length > 0;
}

// 更新虾的可编辑字段（name/role/summary/version/model/domains）。不动 id/owner_user_id/master。
export async function updateBotRow(
  id: string,
  fields: { name: string; role: string; summary: string; version: string; model: string; domains: string[] },
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    update bots set
      name = ${fields.name},
      role = ${fields.role},
      summary = ${fields.summary},
      domains = ${JSON.stringify(fields.domains)}::jsonb,
      version = ${fields.version},
      model = ${fields.model}
    where id = ${id}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// --- Doc assets（上传附件）-----------------------------------------------

// 覆盖式写入文档附件（一个文档最多一个附件）。uploaded_at 由数据库生成。
export async function upsertDocAssetQuery(
  asset: Omit<DocAsset, "uploadedAt">,
  sql: Sql,
) {
  await sql`
    insert into doc_assets (doc_id, doc_type, filename, content_type, content_base64, size_bytes)
    values (
      ${asset.docId}, ${asset.docType}, ${asset.filename}, ${asset.contentType},
      ${asset.contentBase64}, ${asset.sizeBytes}
    )
    on conflict (doc_id) do update set
      doc_type = excluded.doc_type,
      filename = excluded.filename,
      content_type = excluded.content_type,
      content_base64 = excluded.content_base64,
      size_bytes = excluded.size_bytes,
      uploaded_at = now()
  `;
}

export async function upsertDocAsset(asset: Omit<DocAsset, "uploadedAt">) {
  await upsertDocAssetQuery(asset, getSql());
}

export async function deleteDocAssetRow(id: string, type: DocType): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    delete from doc_assets
    where doc_id = ${id} and doc_type = ${type}
    returning doc_id
  `) as Array<{ doc_id: string }>;
  return rows.length > 0;
}

// --- Doc download counts（018）-------------------------------------------
// 每次下载（附件或实时导出）计数 +1。原子 upsert：无记录则插入 1，有则自增。
// 无数据库时为空操作（计数功能依赖数据库，与附件功能一致）。
export async function incrementDocDownload(docId: string): Promise<void> {
  const sql = getOptionalSql();
  if (!sql) {
    return;
  }
  await sql`
    insert into doc_download_counts (doc_id, count) values (${docId}, 1)
    on conflict (doc_id) do update set
      count = doc_download_counts.count + 1,
      updated_at = now()
  `;
}

// --- Post replies & review (009) -----------------------------------------
// 回复单独成表（post_replies），随帖子级联删除。审核记录挂在 posts 上
// （reviewed_at / reviewer）；status 不在这里写，读取时由 derivePostStatus 派生。

export type ReplyInsert = {
  id: string;
  postId: string;
  parentReplyId: string | null;
  authorType: "human" | "bot";
  authorName: string;
  authorBotId: string | null;
  authorUserId: string | null;
  content: string;
  createdAt: string;
};

export async function insertReply(reply: ReplyInsert, sql: Sql = getSql()) {
  await sql`
    insert into post_replies (id, post_id, parent_reply_id, author_type, author_name, author_bot_id, author_user_id, content, created_at)
    values (
      ${reply.id}, ${reply.postId}, ${reply.parentReplyId}, ${reply.authorType}, ${reply.authorName},
      ${reply.authorBotId}, ${reply.authorUserId}, ${reply.content}, ${reply.createdAt}
    )
  `;
}

export type ReplyAssetInsert = {
  id: string;
  replyId: string;
  filename: string;
  contentType: string;
  contentBase64: string;
  sizeBytes: number;
};

// 写入一条回复的附件。随回复级联删除（FK on delete cascade）。
export async function insertReplyAsset(asset: ReplyAssetInsert, sql: Sql = getSql()) {
  await sql`
    insert into post_reply_assets (id, reply_id, filename, content_type, content_base64, size_bytes)
    values (
      ${asset.id}, ${asset.replyId}, ${asset.filename}, ${asset.contentType},
      ${asset.contentBase64}, ${asset.sizeBytes}
    )
  `;
}

// 写入一条回复的文档引用（reply_doc_refs）。随回复级联删除。
// docIds 为空跳过；doc_type 由入参决定（'skills' / 'knowledge'）。
// on conflict do nothing 防御重复主键（同一回复同一 doc 不重复入）。
export async function insertReplyDocRefs(
  replyId: string,
  docIds: string[],
  docType: DocType,
  sql: Sql = getSql(),
): Promise<void> {
  if (docIds.length === 0) return;
  await sql`
    insert into reply_doc_refs (reply_id, doc_id, doc_type)
    select ${replyId} as reply_id, doc_id, ${docType} as doc_type
    from unnest(${docIds}::text[]) as t(doc_id)
    on conflict do nothing
  `;
}

export async function insertReplyMentions(
  replyId: string,
  mentions: Array<{ targetType: "user" | "bot"; targetId: string; name: string; recipientUserId: string | null }>,
  sql: Sql = getSql(),
): Promise<void> {
  for (const mention of mentions) {
    await sql`
      insert into reply_mentions (reply_id, target_type, target_id, target_name, recipient_user_id)
      values (${replyId}, ${mention.targetType}, ${mention.targetId}, ${mention.name}, ${mention.recipientUserId})
      on conflict do nothing
    `;
  }
}

// 人审核通过：记录审核人与时间。返回是否真的命中了一行。
export async function setPostReviewed(postId: string, reviewer: string, reviewedAt: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    update posts set reviewed_at = ${reviewedAt}, reviewer = ${reviewer}
    where id = ${postId}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// 记录帖子最近一次进入【观察中】的时刻（首条回复进入，或已解决帖被新回复 /
// 撤销审批重开）。供总览页"本周待复审"判定帖子是否在本周进入观察中。
export async function setPostMonitoringEntered(postId: string, at: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = (await sql`
    update posts set monitoring_entered_at = ${at}
    where id = ${postId}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// 撤销审核：清空审核记录，回到"观察中"（有回复时）或"未处理"（无回复时）。
export async function clearPostReview(postId: string, sql: Sql = getSql()): Promise<boolean> {
  const rows = (await sql`
    update posts set reviewed_at = null, reviewer = null
    where id = ${postId}
    returning id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

// 删除一条回复（原始行操作）。附件经 FK on delete cascade 自动清除。
// 返回是否真的删到一行；post_id 不匹配时返回 false（由服务层在调用前校验归属帖）。
export async function deleteReplyRow(replyId: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`delete from post_replies where id = ${replyId} returning id`) as Array<{ id: string }>;
  return rows.length > 0;
}

// 取一条回复行（含 post_id / author_user_id / author_bot_id），用于删除授权判定。不存在返回 null。
export async function getReplyRow(replyId: string): Promise<{ id: string; postId: string; authorUserId: string | null; authorBotId: string | null } | null> {
  const sql = getSql();
  const rows = (await sql`
    select id, post_id, author_user_id, author_bot_id from post_replies where id = ${replyId}
  `) as Array<{ id: string; post_id: string; author_user_id: string | null; author_bot_id: string | null }>;
  const row = rows[0];
  return row ? { id: row.id, postId: row.post_id, authorUserId: row.author_user_id ?? null, authorBotId: row.author_bot_id ?? null } : null;
}
