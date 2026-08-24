// src/lib/cli-read-mappers.ts
import { toBeijingIso } from "./format.ts";
import { postAuthorName } from "./post-artifact-fields.ts";
import { docAuthorName } from "./doc-author-name.ts";
import type { Bot, ContentState, DocComment, DocType, EnrichedPost, MarkdownDoc, PostReply, PostStatus } from "./types.ts";

export type PostListItem = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  status: PostStatus;
  createdAt: string;
  authorName: string;
  knowledgeRefs: string[];
  skillRefs: string[];
};

export type ReplyListItem = {
  id: string;
  authorName: string;
  authorType: "human" | "bot";
  content: string;
  createdAt: string;
  knowledgeRefs: { id: string; title: string }[];
  skillRefs: { id: string; title: string }[];
  attachments: { filename: string; contentType: string; sizeBytes: number }[];
};

export type PostDetailItem = PostListItem & {
  fields: Record<string, string>;
  timeline: { time: string; label: string; detail: string }[];
  replies: ReplyListItem[];
};

export type DocListItem = {
  id: string;
  type: DocType;
  title: string;
  summary: string;
  domain: string;
  contentState: ContentState;
  updatedAt: string;
  authorName: string;
  version: string | null;
};

export type DocDetailItem = DocListItem & {
  body: string;
  tags: string[];
  evidence: string | null;
  // 驳回审计字段：Reviewing 文档附驳回者 / 时间 / 理由，供虾复盘。
  rejectionReason: string | null;
  rejector: string | null;
  rejectedAt: string | null;
};

export type DocCommentItem = {
  id: string;
  authorName: string;
  authorType: "human" | "bot";
  content: string;
  createdAt: string;
  parentCommentId: string | null;
  mentionRefs: { targetType: "user" | "bot"; targetId: string; name: string }[];
};

export function toPostListItem(post: EnrichedPost): PostListItem {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    domain: post.domain,
    status: post.status,
    createdAt: toBeijingIso(post.createdAt) ?? post.createdAt,
    authorName: postAuthorName(post),
    knowledgeRefs: post.knowledgeRefs,
    skillRefs: post.skillRefs,
  };
}

function toReplyListItem(reply: PostReply): ReplyListItem {
  return {
    id: reply.id,
    authorName: reply.authorName,
    authorType: reply.authorType,
    content: reply.content,
    createdAt: toBeijingIso(reply.createdAt) ?? reply.createdAt,
    knowledgeRefs: reply.knowledgeRefs,
    skillRefs: reply.skillRefs,
    attachments: reply.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    })),
  };
}

export function toPostDetailItem(post: EnrichedPost): PostDetailItem {
  return {
    ...toPostListItem(post),
    fields: post.fields,
    timeline: post.timeline.map((event) => ({
      ...event,
      time: toBeijingIso(event.time) ?? event.time,
    })),
    replies: post.replies.map(toReplyListItem),
  };
}

export function toDocListItem(
  doc: MarkdownDoc,
  botsById: Map<string, Bot>,
  authorNames: ReadonlyMap<string, string> | Map<string, string>,
): DocListItem {
  return {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    summary: doc.summary,
    domain: (doc.type === "knowledge" ? doc.domain : doc.scenario) ?? "其他",
    contentState: doc.contentState,
    updatedAt: doc.updatedAt,
    authorName: docAuthorName(doc, botsById, authorNames) ?? "未署名",
    version: doc.version,
  };
}

export function toDocDetailItem(
  doc: MarkdownDoc,
  botsById: Map<string, Bot>,
  authorNames: ReadonlyMap<string, string> | Map<string, string>,
): DocDetailItem {
  return {
    ...toDocListItem(doc, botsById, authorNames),
    body: doc.body,
    tags: doc.tags,
    evidence: doc.evidence,
    rejectionReason: doc.rejectionReason ?? null,
    rejector: doc.rejector ?? null,
    rejectedAt: doc.rejectedAt ? toBeijingIso(doc.rejectedAt) : null,
  };
}

export function toDocCommentItem(comment: DocComment): DocCommentItem {
  return {
    id: comment.id,
    authorName: comment.authorUsername,
    authorType: comment.authorType,
    content: comment.content,
    createdAt: toBeijingIso(comment.createdAt) ?? comment.createdAt,
    parentCommentId: comment.parentCommentId,
    mentionRefs: comment.mentionRefs,
  };
}
