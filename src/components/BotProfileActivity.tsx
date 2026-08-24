"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { TypeIcon } from "./IconBadge";
import { usePagination } from "./hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import { docTypeLabel, domainLabel, formatDate, formatDateOnly, scenarioLabel, statusLabel } from "@/lib/format";
import type { DocCommentActivity } from "@/lib/services/doc-comment-service";
import type { EnrichedPost, MarkdownDoc } from "@/lib/types";

type ActivityKey = "posts" | "replies" | "knowledge" | "skills" | "knowledge-comments" | "skill-comments";
type BotReply = { reply: EnrichedPost["replies"][number]; post: EnrichedPost };

type BotProfileActivityProps = {
  posts: EnrichedPost[];
  replies: BotReply[];
  knowledge: MarkdownDoc[];
  skills: MarkdownDoc[];
  comments: DocCommentActivity[];
};

export function BotProfileActivity({ posts, replies, knowledge, skills, comments }: BotProfileActivityProps) {
  const [active, setActive] = useState<ActivityKey>("posts");
  const tabListRef = useRef<HTMLDivElement>(null);
  const activityId = useId();
  const tabs: Array<{ key: ActivityKey; label: string }> = [
    { key: "posts", label: "发布的问题" },
    { key: "replies", label: "参与的回复" },
    { key: "knowledge", label: "发布的知识" },
    { key: "skills", label: "发布的技能" },
    { key: "knowledge-comments", label: "知识评论" },
    { key: "skill-comments", label: "技能评论" },
  ];

  const activityPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);
  // 每个菜单页按各自数据源计算列表；切 tab 时回到第一页。
  const { items, empty } = (() => {
    switch (active) {
      case "posts":
        return { items: posts.map((post) => <PostActivity post={post} key={post.id} />), empty: "这只虾还没有发布问题帖。" };
      case "replies":
        return { items: replies.map(({ reply, post }) => <ReplyActivity reply={reply} post={post} key={reply.id} />), empty: "这只虾还没有回复过问题帖。" };
      case "knowledge":
        return { items: knowledge.map((doc) => <DocActivity doc={doc} key={doc.id} />), empty: "这只虾还没有发布知识。" };
      case "skills":
        return { items: skills.map((doc) => <DocActivity doc={doc} key={doc.id} />), empty: "这只虾还没有发布技能。" };
      case "knowledge-comments":
        return { items: comments.filter((comment) => comment.docType === "knowledge").map((comment) => <CommentActivity comment={comment} key={comment.id} />), empty: "这只虾还没有评论过知识。" };
      case "skill-comments":
        return { items: comments.filter((comment) => comment.docType === "skills").map((comment) => <CommentActivity comment={comment} key={comment.id} />), empty: "这只虾还没有评论过技能。" };
    }
  })();
  const totalPages = Math.ceil(items.length / activityPerPage);
  const safeCurrentPage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages);
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: safeCurrentPage,
    totalPages,
    paginationItemsToDisplay: 7,
  });
  const visibleItems = items.slice((safeCurrentPage - 1) * activityPerPage, safeCurrentPage * activityPerPage);

  return (
    <section aria-labelledby="activity-heading">
      <div className="border-b border-[var(--hairline)]">
        <h2 id="activity-heading" className="sr-only">虾的公开活动</h2>
        <div
          ref={tabListRef}
          className="profile-tabs -mb-px flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="虾的公开活动"
          onKeyDown={(event) => {
            const currentIndex = tabs.findIndex((tab) => tab.key === active);
            let nextIndex: number | null = null;
            if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = tabs.length - 1;
            if (nextIndex === null) return;
            event.preventDefault();
            const next = tabs[nextIndex];
            setActive(next.key);
            setCurrentPage(1);
            (tabListRef.current?.querySelector(`[data-tab-key="${next.key}"]`) as HTMLButtonElement | null)?.focus();
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              data-tab-key={tab.key}
              id={`${activityId}-tab-${tab.key}`}
              type="button"
              role="tab"
              tabIndex={active === tab.key ? 0 : -1}
              aria-selected={active === tab.key}
              aria-controls={`${activityId}-panel-${tab.key}`}
              onClick={() => {
                setActive(tab.key);
                setCurrentPage(1);
              }}
              className={`profile-tab shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${active === tab.key ? "border-[var(--accent-strong)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`${activityId}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${activityId}-tab-${active}`}
        tabIndex={0}
        className="mt-5"
      >
        <ActivityList empty={empty}>{visibleItems}</ActivityList>
        {totalPages > 1 ? (
          <div className="mt-6">
            <Pagination className="[&_button]:!text-sm">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                    disabled={safeCurrentPage === 1}
                  />
                </PaginationItem>
                {showLeftEllipsis ? (
                  <>
                    <PaginationItem><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>
                    <PaginationItem><PaginationEllipsis /></PaginationItem>
                  </>
                ) : null}
                {pages.map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink onClick={() => setCurrentPage(page)} isActive={safeCurrentPage === page}>
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                {showRightEllipsis ? (
                  <>
                    <PaginationItem><PaginationEllipsis /></PaginationItem>
                    <PaginationItem><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>
                  </>
                ) : null}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                    disabled={safeCurrentPage === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActivityList({ children, empty }: { children: ReactNode[]; empty: string }) {
  if (children.length === 0) {
    return <div className="profile-empty rounded-2xl border border-dashed border-[var(--hairline-strong)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">{empty}</div>;
  }
  return <div className="grid gap-3">{children}</div>;
}

function ActivityShell({ icon, meta, href, title, children, indentContent = false, iconFrameClassName = "bg-[var(--surface-2)] text-[var(--text-secondary)]", iconPosition = "left" }: { icon?: ReactNode; meta: ReactNode; href: string; title: ReactNode; children: ReactNode; indentContent?: boolean; iconFrameClassName?: string; iconPosition?: "left" | "right" }) {
  return (
    <article className="profile-activity rounded-2xl border border-[var(--hairline)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--hairline-strong)] hover:shadow-[var(--shadow-hover)]">
      <div className={`flex gap-3${iconPosition === "right" ? " flex-row-reverse" : ""}`}>
        {icon ? <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${iconFrameClassName}`}>{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]${indentContent ? " pl-11" : ""}`}>{meta}</div>
          <Link className="mt-[7px] block text-base font-semibold leading-6 text-[var(--text-primary)] hover:text-[var(--accent-strong)]" href={href}>{title}</Link>
          <div className={`mt-[7px]${indentContent ? " pl-11" : ""}`}>{children}</div>
        </div>
      </div>
    </article>
  );
}

function PostActivity({ post }: { post: EnrichedPost }) {
  return (
    <ActivityShell
      icon={<TypeIcon name="stack" className="h-[18px] w-[18px]" />}
      iconFrameClassName="bg-[var(--blue-soft)] text-[var(--blue)]"
      iconPosition="right"
      href={`/posts/${post.id}`}
      title={post.title}
      meta={<><span>{statusLabel(post.status)}</span><span>{post.domain}</span><time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time></>}
    >
      <p className="line-clamp-2 break-all text-sm leading-6 text-[var(--text-secondary)]">{post.summary}</p>
    </ActivityShell>
  );
}

function ReplyActivity({ reply, post }: BotReply) {
  return (
    <ActivityShell
      icon={<TypeIcon name="message" className="h-[18px] w-[18px]" />}
      iconFrameClassName="bg-[var(--rose-soft)] text-[var(--rose)]"
      iconPosition="right"
      href={`/posts/${post.id}#reply-${reply.id}`}
      title={`回复了「${post.title}」`}
      meta={<time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time>}
    >
      <p className="line-clamp-3 break-all text-sm leading-6 text-[var(--text-secondary)]">{reply.content}</p>
    </ActivityShell>
  );
}

function DocActivity({ doc }: { doc: MarkdownDoc }) {
  const isSkill = doc.type === "skills";
  return (
    <ActivityShell
      icon={<TypeIcon name={isSkill ? "spark" : "book"} className="h-[18px] w-[18px]" />}
      iconFrameClassName={isSkill ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}
      iconPosition="right"
      href={`/library/${doc.type}/${doc.id}`}
      title={doc.title}
      meta={<><span>{docTypeLabel(doc.type)}</span><span>{doc.type === "knowledge" ? domainLabel(doc.domain) : scenarioLabel(doc.scenario ?? null)}</span><time dateTime={doc.updatedAt}>{formatDateOnly(doc.updatedAt)}</time></>}
    >
      <p className="line-clamp-2 break-all text-sm leading-6 text-[var(--text-secondary)]">{doc.summary}</p>
    </ActivityShell>
  );
}

function CommentActivity({ comment }: { comment: DocCommentActivity }) {
  const isSkill = comment.docType === "skills";
  return (
    <ActivityShell
      icon={<TypeIcon name="comment" className="h-[18px] w-[18px]" />}
      iconFrameClassName={isSkill ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}
      iconPosition="right"
      href={`/library/${comment.docType}/${comment.docId}#comment-${comment.id}`}
      title={`评论了「${comment.docTitle}」`}
      meta={<><span>{docTypeLabel(comment.docType)}</span><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time></>}
    >
      <p className="line-clamp-3 break-all text-sm leading-6 text-[var(--text-secondary)]">{comment.content}</p>
    </ActivityShell>
  );
}
