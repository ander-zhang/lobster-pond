"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, MessageCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DocComment } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { mergeMentionRefs, Picker, renderMentionOption, renderMentionToken, syncMirrorScroll, type Mention } from "./composer-kit";
import { useMentionCompletion } from "./hooks/useMentionCompletion";

type SubmitState = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

function renderCommentContent(
  content: string,
  mentions: DocComment["mentionRefs"],
  emphasizeMentions = true,
): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /@([^\s@]+)/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (match.index > last) nodes.push(content.slice(last, match.index));
    const mentionName = match[1];
    const mention = mentions.find((item) => item.name === mentionName);
    nodes.push(<Fragment key={index++}>{renderMentionToken(mentionName, Boolean(mention), mention?.targetType === "bot" ? mention.targetId : undefined, emphasizeMentions)}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes;
}

function ReplyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
      <path d="M15.59 12.4V16.47C15.59 16.83 15.55 17.17 15.46 17.48C15.09 18.95 13.87 19.87 12.19 19.87H9.47L6.45 21.88C6 22.19 5.4 21.86 5.4 21.32V19.87C4.38 19.87 3.53 19.53 2.94 18.94C2.34 18.34 2 17.49 2 16.47V12.4C2 10.5 3.18 9.19 5 9.02C5.13 9.01 5.26 9 5.4 9H12.19C14.23 9 15.59 10.36 15.59 12.4Z" fill="currentColor" />
      <path d="M17.75 15.6C19.02 15.6 20.09 15.18 20.83 14.43C21.58 13.69 22 12.62 22 11.35V6.25C22 3.9 20.1 2 17.75 2H9.25C6.9 2 5 3.9 5 6.25V7C5 7.28 5.22 7.5 5.5 7.5H12.19C14.9 7.5 17.09 9.69 17.09 12.4V15.1C17.09 15.38 17.31 15.6 17.59 15.6H17.75Z" fill="currentColor" />
    </svg>
  );
}

// 文档详情页评论区：登录用户可发评论、艾特用户或虾，并可删除自己的评论。
export function DocCommentPanel({ docId, docType, initialComments, mentions = [], ownedBotIds = [] }: { docId: string; docType: "knowledge" | "skills"; initialComments: DocComment[]; mentions?: Mention[]; ownedBotIds?: string[] }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<DocComment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListId = useId();
  const mirrorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerTriggerRef = useRef<HTMLButtonElement>(null);
  const mentionCompletion = useMentionCompletion({ mentions, content, setContent, textareaRef });
  const { setQuery: setMentionQuery } = mentionCompletion;
  const isSubmitting = state.kind === "submitting";
  const canSubmit = Boolean(user) && content.trim().length > 0 && !isSubmitting;
  const ownedBotIdSet = useMemo(() => new Set(ownedBotIds), [ownedBotIds]);
  // router.refresh()（全站实时刷新 / 自身操作）会传入新的 initialComments，
  // 本地 state 需跟随服务端数据同步；草稿等独立 state 不受影响。
  useEffect(() => {
    // 按 prop 重置内部态的合法场景，禁用 set-state-in-effect 规则。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments(initialComments);
  }, [initialComments]);
  const roots = comments.filter((comment) => !comment.parentCommentId);

  useEffect(() => {
    if (!composerOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node
        && !composerRef.current?.contains(target)
        && !composerTriggerRef.current?.contains(target)
        && !(target instanceof Element && target.closest("[data-comment-reply-trigger]"))
      ) {
        setReplyTarget(null);
        setComposerOpen(false);
        setContent("");
        setMentionQuery(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [composerOpen, setMentionQuery]);

  function openReply(comment: DocComment) {
    if (composerOpen && replyTarget?.id === comment.id) {
      setReplyTarget(null);
      setComposerOpen(false);
      setContent("");
      setMentionQuery(null);
      return;
    }
    const initialMention = `@${comment.authorUsername} `;
    setReplyTarget(comment);
    setComposerOpen(true);
    setContent(initialMention);
    setMentionQuery(null);
    setState({ kind: "idle" });
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(initialMention.length, initialMention.length);
    });
  }

  function syncComposerScroll() {
    syncMirrorScroll(textareaRef, mirrorRef);
  }

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setContent(value);
    mentionCompletion.syncFromCaret(value, event.target.selectionStart);
    requestAnimationFrame(syncComposerScroll);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionCompletion.handleKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setState({ kind: "submitting" });
    const mentionRefs = mergeMentionRefs(null, content, mentions);
    try {
      const response = await fetch(`/api/docs/${docType}/${encodeURIComponent(docId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentionRefs, ...(replyTarget ? { parentCommentId: replyTarget.id } : {}) }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; comment?: DocComment };
      if (!response.ok || !payload.ok || !payload.comment) {
        setState({ kind: "error", message: payload.error ?? `发表评论失败（HTTP ${response.status}）` });
        return;
      }
      setComments((current) => [...current, payload.comment!]);
      setContent("");
      setReplyTarget(null);
      setMentionQuery(null);
      setComposerOpen(false);
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
    }
  }

  async function deleteComment(commentId: string) {
    const previous = comments;
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    try {
      const response = await fetch(`/api/docs/${docType}/${encodeURIComponent(docId)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        let payload: { error?: string } = {};
        try {
          payload = (await response.json()) as { error?: string };
        } catch {
          // 非 JSON 响应使用默认错误信息。
        }
        setComments(previous);
        setState({ kind: "error", message: payload.error ?? `删除评论失败（HTTP ${response.status}）` });
      } else {
        setComments((current) => current
          .filter((comment) => comment.id !== commentId)
          .map((comment) => comment.parentCommentId === commentId ? { ...comment, parentCommentId: null } : comment));
        setState({ kind: "idle" });
        router.refresh();
      }
    } catch {
      setComments(previous);
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
    }
  }

  async function confirmDelete() {
    const commentId = pendingDelete;
    setPendingDelete(null);
    if (commentId) await deleteComment(commentId);
  }

  function renderComposer() {
    if (!loading && !user) {
      return <p className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]">请先登录后再评论</p>;
    }
    return (
      <div ref={composerRef} id="doc-comment-composer" className="relative mt-4 rounded-2xl border border-[var(--hairline)] bg-white p-2 shadow-[0_8px_18px_rgba(42,67,101,0.06)]">
        {replyTarget ? (
          <div className="flex items-center justify-between gap-3 px-3 pb-2 text-xs text-[var(--text-muted)]">
            <span>回复 {replyTarget.authorUsername}</span>
            <button type="button" onClick={() => { setReplyTarget(null); setContent(""); }} className="hover:text-[var(--text-primary)]">取消回复</button>
          </div>
        ) : null}
        {mentionCompletion.query !== null && mentionCompletion.candidates.length > 0 ? (
          <Picker items={mentionCompletion.candidates} index={mentionCompletion.index} listId={mentionListId} onHover={mentionCompletion.setIndex} onPick={mentionCompletion.insert} render={renderMentionOption} />
        ) : null}
        <div>
          <div className="relative overflow-hidden">
            <div
              ref={mirrorRef}
              aria-hidden
              data-input-mirror
              className="pointer-events-none absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] whitespace-pre-wrap break-words px-3 py-2 text-sm font-normal leading-6 tracking-normal text-[var(--text-primary)]"
            >
              {content ? renderCommentContent(content, mentions, false) : null}
            </div>
            <textarea
            ref={textareaRef}
            value={content}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mentionCompletion.query !== null && mentionCompletion.candidates.length > 0}
            aria-controls={mentionCompletion.query !== null ? mentionListId : undefined}
            aria-activedescendant={mentionCompletion.query !== null && mentionCompletion.candidates.length > 0 ? `${mentionListId}-option-${mentionCompletion.index}` : undefined}
            maxLength={2000}
            rows={3}
            onChange={handleComposerChange}
            onScroll={syncComposerScroll}
            onKeyDown={handleComposerKeyDown}
            placeholder="写下你的评论…（@ 艾特用户或虾，Enter 发送，Shift+Enter 换行）"
            className="relative block w-full resize-none overflow-y-auto [scrollbar-gutter:stable] border-none bg-transparent px-3 py-2 text-sm font-normal leading-6 tracking-normal text-transparent caret-[var(--text-primary)] shadow-none outline-none placeholder:text-[var(--text-muted)] placeholder:opacity-100 selection:bg-[rgba(55,114,207,0.18)]"
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <span className="text-xs text-[var(--text-muted)]">{content.length}/2000</span>
            <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={`flex size-8 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40 ${docType === "knowledge" ? "bg-[var(--amber)] hover:bg-[var(--amber-strong)]" : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"}`} aria-label="发送评论" title="发送评论">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const composer = renderComposer();

  function renderComment(comment: DocComment, nested = false) {
    const mentionRefs = mergeMentionRefs(comment.mentionRefs, comment.content, mentions);
    return (
      <div id={`comment-${comment.id}`} key={comment.id} className={nested ? "py-3" : "py-4"}>
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{comment.authorUsername}</p>
          {user ? (
            <button
              type="button"
              data-comment-reply-trigger
              onClick={() => openReply(comment)}
              className="flex size-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              aria-label={`回复 ${comment.authorUsername}`}
              title="回复"
            >
              <ReplyIcon />
            </button>
          ) : null}
          <time className="mono ml-auto shrink-0 text-xs text-[var(--text-muted)]" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
          {user != null && (comment.authorUserId === user.id || (comment.authorType === "bot" && comment.authorBotId !== null && ownedBotIdSet.has(comment.authorBotId))) ? (
            <button
              type="button"
              onClick={() => setPendingDelete(comment.id)}
              className="flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--rose-soft)] hover:text-[var(--rose-strong)]"
              aria-label="删除评论"
              title="删除评论"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">
          {renderCommentContent(comment.content, mentionRefs)}
        </p>
        {composerOpen && replyTarget?.id === comment.id ? composer : null}
      </div>
    );
  }

  return (
    <section className="bento-card mt-6 p-5 md:p-6" aria-labelledby="doc-comments-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="doc-comments-heading" className="flex items-center gap-2 text-[0.84rem] font-[650] text-[var(--text-primary)]">
          评论
          <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">{comments.length}</span>
        </h2>
        <button
          ref={composerTriggerRef}
          type="button"
          onClick={() => {
            setComposerOpen((open) => !open);
            setReplyTarget(null);
            setContent("");
          }}
          className={`flex size-8 items-center justify-center rounded-full text-white transition-colors ${docType === "knowledge" ? "bg-[var(--amber)] hover:bg-[var(--amber-strong)]" : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"}`}
          aria-expanded={composerOpen}
          aria-controls="doc-comment-composer"
          aria-label={composerOpen ? "收起评论输入框" : "发表评论"}
          title={composerOpen ? "收起评论输入框" : "发表评论"}
        >
          <MessageCircle className="size-4" />
        </button>
      </div>

      {composerOpen && !replyTarget ? composer : null}
      {state.kind === "error" ? <p className="mt-2 text-sm text-[var(--rose-strong)]" role="alert">{state.message}</p> : null}

      {comments.length > 0 ? (
        <ul className="mt-5 divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {roots.map((root) => (
            <li key={root.id}>
              {renderComment(root)}
              {comments.some((comment) => comment.parentCommentId === root.id) ? (
                <div className="mb-3 ml-3 border-l-2 border-[var(--surface-3)] pl-3">
                  {comments.filter((comment) => comment.parentCommentId === root.id).map((comment) => renderComment(comment, true))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 border-t border-[var(--hairline)] pt-4 text-sm text-[var(--text-muted)]">暂无评论，来说点什么吧。</p>
      )}

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>确认删除评论？</DialogTitle>
            <DialogDescription>删除后无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button className="bg-[var(--rose-strong)] text-white hover:bg-[var(--rose-strong)]/90" onClick={() => void confirmDelete()}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
