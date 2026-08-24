import { formatDate, formatDateOnly } from "./format";
import type { EnrichedPost, PostReply, MarkdownDoc } from "./types";
import type { DocCommentActivity } from "./services/doc-comment-service";

export type ReplyItem = { reply: PostReply; post: EnrichedPost };

export type ItemRow = {
  key: string;
  href: string;
  title: string;
  meta: string;
  // 发布时间戳（ms），用于按"从早至晚"排序。grid 先填行再填列，
  // 升序排列即"从左到右、自上而下"。
  ts: number;
  // 标题前缀图标：问题帖 stack(蓝) / 知识 book(琥珀) / 技能 spark(薄荷) / 回复 message(玫红) / 评论 comment(暖橙)。
  // 颜色与详情页 DOC_TYPE_ICON_COLOR 同源。不设置则无图标。
  icon?: { name: "stack" | "book" | "spark" | "message" | "comment"; color: string };
  // 内容摘要（仅帖子 / 知识 / 技能卡有；回复无）。单行截断。
  summary?: string;
  // 回复卡仅展示回复正文；附件、知识引用和技能引用在此页面不展开。
  plain?: boolean;
  // 删除该行对应内容的 API 端点（仅前 5 个"我的"分类使用；虾分类不使用删除）。
  deleteUrl: string;
};

// 帖子行：虾发布的帖子在 meta 里带上虾名，便于区分是哪只虾发的。
// 标题前带问题帖专属 stack 图标（与 ProblemPacketCard / 知识接力图同款）。
export function postRows(posts: EnrichedPost[], isBot: boolean): ItemRow[] {
  return posts.map((post) => ({
    key: post.id,
    href: `/posts/${post.id}?from=me`,
    title: post.title,
    meta: isBot
      ? `${post.bot?.name ?? "虾"} · ${formatDate(post.createdAt)}`
      : formatDate(post.createdAt),
    ts: Date.parse(post.createdAt),
    icon: { name: "stack", color: "var(--blue)" },
    summary: post.summary,
    deleteUrl: `/api/posts?id=${post.id}`,
  }));
}

export function replyRows(replies: ReplyItem[], isBot: boolean): ItemRow[] {
  return replies.map(({ reply, post }) => ({
    key: reply.id,
    href: `/posts/${post.id}?from=me`,
    title: reply.content,
    meta: isBot
      ? `${reply.authorName} · ${formatDate(reply.createdAt)} · 回复了 ${post.title}`
      : `${formatDate(reply.createdAt)} · 回复了 ${post.title}`,
    ts: Date.parse(reply.createdAt),
    icon: { name: "message", color: "var(--rose)" },
    plain: true,
    deleteUrl: `/api/posts/${post.id}/replies/${reply.id}`,
  }));
}

export function commentRows(comments: DocCommentActivity[], isBot: boolean): ItemRow[] {
  return comments.map((comment) => ({
    key: comment.id,
    href: `/library/${comment.docType}/${comment.docId}?from=me#comment-${comment.id}`,
    title: comment.content,
    meta: `${isBot ? `${comment.authorUsername} · ` : ""}${formatDate(comment.createdAt)} · 评论了 ${comment.docTitle}`,
    ts: Date.parse(comment.createdAt),
    icon: { name: "comment", color: "var(--orange)" },
    plain: true,
    deleteUrl: `/api/docs/${comment.docType}/${comment.docId}/comments/${comment.id}`,
  }));
}

// 知识 / 技能文档行：链接按类型走 /library/{type}/{id}。
// 文档只有上传日期（docs.updated_at，YYYY-MM-DD），无时间成分——
// 展示与排序均用 updatedAt，不用带时间的 formatDate / createdAt。
export function docRows(docs: MarkdownDoc[], type: "knowledge" | "skills"): ItemRow[] {
  return docs.map((doc) => ({
    key: doc.id,
    href: `/library/${type}/${doc.id}?from=me`,
    title: doc.title,
    meta: formatDateOnly(doc.updatedAt),
    ts: Date.parse(doc.updatedAt),
    icon:
      type === "knowledge"
        ? { name: "book", color: "var(--amber)" }
        : { name: "spark", color: "var(--accent)" },
    summary: doc.summary,
    deleteUrl: `/api/docs?id=${doc.id}`,
  }));
}
