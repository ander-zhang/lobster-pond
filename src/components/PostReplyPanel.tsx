"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Download, Paperclip, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormStatus, type SubmitState } from "./admin/form-primitives";
import { useAuth } from "./auth/AuthProvider";
import type { PostReply, ReplyAttachment } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { parseSkillReferences } from "@/lib/reply-skill-refs";
import { KnowledgeBookIcon } from "./KnowledgeBookIcon";
import { mergeMentionRefs, Picker, renderMentionOption, renderMentionToken, syncMirrorScroll, tokenContext, type Mention } from "./composer-kit";
import { useMentionCompletion } from "./hooks/useMentionCompletion";

type PostReplyPanelProps = {
  postId: string;
  initialReplies: PostReply[];
  skills: { id: string; title: string }[];
  knowledge: { id: string; title: string }[];
  mentions: Mention[];
};
type PendingAttachment = { file: File; contentBase64: string };
type ComposerValue = {
  content: string;
  files: PendingAttachment[];
  skillRefs: string[];
  knowledgeRefs: string[];
  mentionRefs: Mention[];
  parentReplyId?: string | null;
};

function parentReplyId(reply: PostReply) {
  return reply.parentReplyId ?? null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderHighlightedContent(content: string, skillIds: Set<string>, mentionNames: Set<string>, botMentionIds: Map<string, string> = new Map()): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /(?:^|\s)\/([a-z0-9][a-z0-9-]*)|@([^\s@]+)/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    const token = match[2] ? `@${match[2]}` : `/${match[1]}`;
    const start = match.index + match[0].length - token.length;
    if (start > last) nodes.push(content.slice(last, start));

    const highlighted = match[1] ? skillIds.has(match[1]) : mentionNames.has(match[2]);
    if (match[1]) {
      nodes.push(highlighted ? <span key={index++} style={{ color: "var(--accent-strong)" }}>{token}</span> : token);
    } else {
      const name = match[2] as string;
      nodes.push(<Fragment key={index++}>{renderMentionToken(name, highlighted, botMentionIds.get(name))}</Fragment>);
    }
    last = start + token.length;
  }

  if (last < content.length) nodes.push(content.slice(last));
  return nodes;
}

function ReplyComposer({ skills, knowledge, mentions, initialMention, parentReplyId: parentId, compact = false, onSubmit }: {
  skills: PostReplyPanelProps["skills"];
  knowledge: PostReplyPanelProps["knowledge"];
  mentions: Mention[];
  initialMention?: Mention;
  parentReplyId?: string | null;
  compact?: boolean;
  onSubmit: (value: ComposerValue) => Promise<string | null>;
}) {
  const inputId = useId();
  const mentionPickerId = `${inputId}-mentions`;
  const skillPickerId = `${inputId}-skills`;
  const approvedIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills]);
  const mentionNames = useMemo(() => new Set(mentions.map((mention) => mention.name)), [mentions]);
  const forcedPrefix = initialMention ? `@${initialMention.name} ` : "";
  const [content, setContent] = useState(forcedPrefix);
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [status, setStatus] = useState<SubmitState>({ kind: "idle" });
  const [skillQuery, setSkillQuery] = useState<string | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [skillIndex, setSkillIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const knowledgeRef = useRef<HTMLDivElement>(null);
  const knowledgeSearchRef = useRef<HTMLInputElement>(null);
  const knowledgeListRef = useRef<HTMLDivElement>(null);
  const pendingKnowledgeScrollTop = useRef<number | null>(null);
  const mentionCompletion = useMentionCompletion({ mentions, content, setContent, textareaRef });

  useLayoutEffect(() => {
    if (pendingKnowledgeScrollTop.current !== null && knowledgeListRef.current) {
      knowledgeListRef.current.scrollTop = pendingKnowledgeScrollTop.current;
      pendingKnowledgeScrollTop.current = null;
    }
  });

  const skillCandidates = useMemo(() => skills.filter((skill) => !skillQuery || skill.id.toLowerCase().includes(skillQuery.toLowerCase()) || skill.title.toLowerCase().includes(skillQuery.toLowerCase())), [skills, skillQuery]);
  const knowledgeCandidates = useMemo(() => knowledge.filter((item) => !knowledgeQuery || item.id.toLowerCase().includes(knowledgeQuery.toLowerCase()) || item.title.toLowerCase().includes(knowledgeQuery.toLowerCase())), [knowledge, knowledgeQuery]);
  const userText = initialMention && content.startsWith(forcedPrefix) ? content.slice(forcedPrefix.length).trim() : content.trim();
  const canSubmit = status.kind !== "submitting" && userText.length >= 1;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    requestAnimationFrame(syncComposerScroll);
  }, [content]);

  useEffect(() => {
    if (!knowledgeOpen) return;
    const close = (event: MouseEvent) => {
      if (knowledgeRef.current && !knowledgeRef.current.contains(event.target as Node)) {
        setKnowledgeOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [knowledgeOpen]);

  function syncComposerScroll() {
    syncMirrorScroll(textareaRef, mirrorRef);
  }

  function toggleKnowledge(id: string) {
    pendingKnowledgeScrollTop.current = knowledgeListRef.current?.scrollTop ?? 0;
    setSelectedKnowledge((all) => all.includes(id) ? all.filter((value) => value !== id) : [...all, id]);
  }


  function toggleKnowledgePicker() {
    setKnowledgeOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setKnowledgeQuery("");
        // 搜索框自动聚焦，但不让浏览器把页面滚动到输入框位置。
        requestAnimationFrame(() => knowledgeSearchRef.current?.focus({ preventScroll: true }));
      }
      return nextOpen;
    });
  }

  function insertSkill(skillId: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const markerIndex = content.slice(0, start).lastIndexOf("/");
    const text = `/${skillId} `;
    setContent(content.slice(0, markerIndex) + text + content.slice(textarea.selectionEnd));
    setSkillQuery(null);
    requestAnimationFrame(() => {
      const caret = markerIndex + text.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  async function submit() {
    if (!canSubmit) {
      setStatus({ kind: "error", message: "回复内容不能为空" });
      return;
    }
    setStatus({ kind: "submitting" });
    const parsed = parseSkillReferences(content, approvedIds);
    const mentionRefs = mergeMentionRefs(initialMention ? [initialMention] : [], content, mentions);
    const error = await onSubmit({ content: parsed.stripped, files, skillRefs: parsed.refs, knowledgeRefs: selectedKnowledge, mentionRefs, ...(parentId ? { parentReplyId: parentId } : {}) });
    if (error) {
      setStatus({ kind: "error", message: error });
      return;
    }
    setContent(forcedPrefix);
    setFiles([]);
    setSelectedKnowledge([]);
    setStatus({ kind: "success", message: "回复已发布" });
    window.setTimeout(() => setStatus({ kind: "idle" }), 1000);
  }

  const orderedKnowledge = [...knowledgeCandidates.filter((item) => selectedKnowledge.includes(item.id)), ...knowledgeCandidates.filter((item) => !selectedKnowledge.includes(item.id))];
  const mentionPickerOpen = mentionCompletion.query !== null && mentionCompletion.candidates.length > 0;
  const skillPickerOpen = skillQuery !== null && skillCandidates.length > 0;

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    const caret = event.target.selectionStart;
    setContent(value);
    setSkillQuery(tokenContext(value, caret, "/"));
    mentionCompletion.syncFromCaret(value, caret);
    setSkillIndex(0);
    requestAnimationFrame(syncComposerScroll);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (skillQuery !== null && skillCandidates.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSkillIndex((index) => (index + 1) % skillCandidates.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSkillIndex((index) => (index - 1 + skillCandidates.length) % skillCandidates.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        insertSkill(skillCandidates[skillIndex].id);
      } else if (event.key === "Escape") setSkillQuery(null);
      return;
    }
    if (mentionCompletion.handleKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    const attachments = await Promise.all(picked.map(async (file) => ({ file, contentBase64: await readFileAsBase64(file) })));
    setFiles((all) => [...all, ...attachments]);
    if (fileRef.current) fileRef.current.value = "";
  }

  return <div className={`reply-composer relative rounded-3xl border border-[var(--hairline)] bg-white p-2 shadow-[0_8px_18px_rgba(42,67,101,0.06)] ${compact ? "mt-3" : ""}`}>
    {files.length > 0 && (
      <div className="flex flex-wrap gap-2 pb-2">
        {files.map((item, index) => (
          <div key={`${item.file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
            <Paperclip className="size-4" />
            <span className="max-w-[160px] truncate">{item.file.name}</span>
            <span className="text-[var(--text-muted)]">{formatBytes(item.file.size)}</span>
            <button type="button" onClick={() => setFiles((all) => all.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full p-1 transition-shadow hover:bg-white/70 hover:shadow-[0_2px_6px_rgba(42,67,101,0.18)]" aria-label="移除附件"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    )}
    {selectedKnowledge.length > 0 && (
      <div className="flex flex-wrap gap-2 pb-2">
        {selectedKnowledge.map((id) => {
          const item = knowledge.find((knowledgeItem) => knowledgeItem.id === id);
          return (
            <div key={id} className="flex items-center gap-2 rounded-lg bg-[var(--amber-soft)] px-3 py-2 text-sm">
              <KnowledgeBookIcon className="size-4 text-[var(--amber-strong)]" />
              <Link href={`/library/knowledge/${id}`} className="max-w-[160px] truncate">{item?.title ?? id}</Link>
              <button type="button" onClick={() => setSelectedKnowledge((all) => all.filter((value) => value !== id))} className="rounded-full p-1 transition-shadow hover:bg-white/70 hover:shadow-[0_2px_6px_rgba(42,67,101,0.18)]" aria-label="移除知识"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    )}
    <div className="relative">
      <div ref={mirrorRef} aria-hidden data-input-mirror className="pointer-events-none absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] break-words whitespace-pre-wrap px-3 py-2 text-sm font-normal leading-6 tracking-normal text-[var(--text-primary)]">
        {content && renderHighlightedContent(content, approvedIds, mentionNames, new Map(mentions.filter((mention) => mention.targetType === "bot").map((mention) => [mention.name, mention.targetId])))}
      </div>
      {mentionCompletion.query !== null && mentionCompletion.candidates.length > 0 && <Picker items={mentionCompletion.candidates} index={mentionCompletion.index} listId={mentionPickerId} onHover={mentionCompletion.setIndex} onPick={mentionCompletion.insert} render={renderMentionOption} />}
      {skillQuery !== null && skillCandidates.length > 0 && (
        <Picker items={skillCandidates} index={skillIndex} listId={skillPickerId} onHover={setSkillIndex} onPick={(skill) => insertSkill(skill.id)} render={(skill) => <><span className="text-[var(--accent-strong)]">/{skill.id}</span><span className="truncate text-[var(--text-muted)]">{skill.title}</span></>} />
      )}
      <textarea
        ref={textareaRef}
        value={content}
        rows={1}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mentionPickerOpen || skillPickerOpen}
        aria-controls={mentionCompletion.query !== null ? mentionPickerId : skillQuery !== null ? skillPickerId : undefined}
        aria-activedescendant={mentionPickerOpen ? `${mentionPickerId}-option-${mentionCompletion.index}` : skillPickerOpen ? `${skillPickerId}-option-${skillIndex}` : undefined}
        placeholder="写点什么，或上传附件回复…（/ 引用技能，Enter 发送，Shift+Enter 换行）"
        className="relative block w-full resize-none overflow-y-auto [scrollbar-gutter:stable] border-none bg-transparent px-3 py-2 text-sm font-normal leading-6 tracking-normal text-transparent shadow-none outline-none caret-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:opacity-100"
        onChange={handleComposerChange}
        onScroll={syncComposerScroll}
        onKeyDown={handleComposerKeyDown}
      />
    </div>
    <div ref={knowledgeRef} className="flex items-center justify-end gap-1 pt-2">
      <label htmlFor={inputId} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl hover:bg-[var(--surface-2)]" title="上传附件" aria-label="上传附件">
        <input id={inputId} ref={fileRef} type="file" multiple className="sr-only" onChange={handleFilePick} />
        <Paperclip className="size-5 text-[var(--text-secondary)]" />
      </label>
      <button type="button" onClick={toggleKnowledgePicker} className="flex h-8 w-8 items-center justify-center rounded-2xl hover:bg-[var(--surface-2)]" title="引用知识"><KnowledgeBookIcon className="size-5 text-[var(--text-secondary)]" /></button>
      <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--blue)] text-white hover:bg-[var(--blue)]/90 disabled:opacity-40" aria-label="发送回复"><ArrowUp className="size-5" /></button>
      {knowledgeOpen && (
        <div className="knowledge-picker absolute bottom-12 left-0 z-10 w-full rounded-xl border border-[var(--hairline)] bg-white p-1 shadow-lg">
          <div className="border-b border-[var(--hairline)] p-1 pb-2">
            <input ref={knowledgeSearchRef} autoFocus type="search" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="搜索知识名称或 ID" className="h-8 w-full rounded-lg border border-[var(--hairline)] px-2.5 text-sm outline-none focus:border-[var(--hairline)] focus:outline-none focus-visible:border-[var(--hairline)] focus-visible:outline-none focus-visible:ring-0" />
          </div>
          <div ref={knowledgeListRef} className="max-h-[20.5rem] overflow-y-auto pt-1">
            {orderedKnowledge.map((item) => {
              const selected = selectedKnowledge.includes(item.id);
              return (
                <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleKnowledge(item.id)} className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-2)] ${selected ? "bg-[var(--surface-2)]" : ""}`}>
                  <span className="mt-0.5 flex size-4 items-center justify-center rounded border">{selected && <Check className="size-3.5 text-[var(--accent-strong)]" />}</span>
                  <span><span className="block text-sm">{item.title}</span><span className="text-xs text-[var(--text-muted)]">{item.id}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
    <FormStatus state={status} />
  </div>;
}

export function PostReplyPanel({ postId, initialReplies: rawReplies, skills: rawSkills, knowledge: rawKnowledge, mentions: rawMentions = [] }: PostReplyPanelProps) {
  // Server data should be arrays, but keep the client boundary safe if a legacy or
  // partially populated post payload omits one of the optional collections.
  const initialReplies = Array.isArray(rawReplies) ? rawReplies : [];
  const skills = Array.isArray(rawSkills) ? rawSkills : [];
  const knowledge = Array.isArray(rawKnowledge) ? rawKnowledge : [];
  const mentions = Array.isArray(rawMentions) ? rawMentions : [];
  const { user, loading } = useAuth();
  const router = useRouter();
  const [replies, setReplies] = useState<PostReply[]>(initialReplies);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [openReplyTo, setOpenReplyTo] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const authenticated = !loading && Boolean(user);

  // router.refresh()（全站实时刷新 / 自身操作）会传入新的 initialReplies，
  // 本地 state 需跟随服务端数据同步；草稿等独立 state 不受影响。
  // 依赖用原始 prop rawReplies（引用变化即服务端新数据），不能用上面
  // Array.isArray 兜底出来的 initialReplies——非数组时它每次渲染都是新引用。
  useEffect(() => {
    // 按 prop 重置内部态的合法场景，禁用 set-state-in-effect 规则。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplies(Array.isArray(rawReplies) ? rawReplies : []);
  }, [rawReplies]);

  useEffect(() => {
    if (!openReplyTo) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element
        && !target.closest("[data-inline-reply-composer]")
        && !target.closest("[data-reply-trigger]")
      ) {
        setOpenReplyTo(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openReplyTo]);

  async function submit(value: ComposerValue): Promise<string | null> {
    if (!user) return "请先登录后再回复";
    const temporaryId = `pending-${Date.now()}`;
    const temporary: PostReply = {
      id: temporaryId,
      authorType: "human" as const,
      authorName: user.username,
      authorBotId: null,
      authorUserId: user.id,
      content: value.content,
      createdAt: new Date().toISOString(),
      attachments: [],
      skillRefs: skills.filter((skill) => value.skillRefs.includes(skill.id)),
      knowledgeRefs: knowledge.filter((item) => value.knowledgeRefs.includes(item.id)),
      mentionRefs: value.mentionRefs,
      parentReplyId: value.parentReplyId ?? null,
    };
    setReplies((all) => [...all, temporary]);
    let response: Response;
    try {
      const payload = {
        authorType: "human" as const,
        content: value.content,
        skillRefs: value.skillRefs,
        knowledgeRefs: value.knowledgeRefs,
        mentionRefs: value.mentionRefs,
        attachments: value.files.map((item) => ({ filename: item.file.name, contentType: item.file.type || undefined, contentBase64: item.contentBase64 })),
        ...(value.parentReplyId ? { parentReplyId: value.parentReplyId } : {}),
      };
      response = await fetch(`/api/posts/${postId}/replies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch {
      setReplies((all) => all.filter((reply) => reply.id !== temporaryId));
      return "网络请求失败，请检查服务是否在运行";
    }
    let payload: Record<string, unknown> = {};
    try { payload = await response.json() as Record<string, unknown>; } catch { /* non-JSON response */ }
    if (!response.ok || !payload.reply) {
      setReplies((all) => all.filter((reply) => reply.id !== temporaryId));
      return typeof payload.error === "string" ? payload.error : `提交失败（HTTP ${response.status}）`;
    }
    setReplies((all) => all.map((reply) => reply.id === temporaryId ? payload.reply as PostReply : reply));
    setOpenReplyTo(null);
    router.refresh();
    return null;
  }

  async function deleteReply(replyId: string) {
    const previous = replies;
    const reply = replies.find((item) => item.id === replyId);
    const removeIds = new Set([replyId]);
    setDeleteError(null);
    setReplies((all) => all.filter((item) => !removeIds.has(item.id)));
    setPendingDelete(null);
    try {
      const response = await fetch(`/api/posts/${postId}/replies/${replyId}`, { method: "DELETE" });
      let payload: Record<string, unknown> = {};
      try { payload = await response.json() as Record<string, unknown>; } catch { /* non-JSON response */ }
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `删除失败（HTTP ${response.status}）`);
      router.refresh();
    } catch (error) {
      setReplies(previous);
      if (reply) setOpenReplyTo(reply.id);
      setDeleteError(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  }

  const roots = replies.filter((reply) => !parentReplyId(reply));
  return <section className="mt-6">
    {!authenticated && <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]">请先登录后再回复</div>}
    {authenticated && <ReplyComposer skills={skills} knowledge={knowledge} mentions={mentions} onSubmit={submit} />}
    {deleteError && <p role="alert" className="mt-3 text-sm text-[var(--rose-strong)]">{deleteError}</p>}
    <div className="mt-5 space-y-3">
      {roots.map((root) => (
        <ReplyItem
          key={root.id}
          postId={postId}
          reply={root}
          childReplies={replies.filter((reply) => parentReplyId(reply) === root.id)}
          currentUserId={user?.id}
          authenticated={authenticated}
          openReplyTo={openReplyTo}
          onReply={(reply) => setOpenReplyTo((id) => id === reply.id ? null : reply.id)}
          onDelete={setPendingDelete}
          skills={skills}
          knowledge={knowledge}
          mentions={mentions}
          onSubmit={submit}
        />
      ))}
    </div>
    <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>确认删除回复？</DialogTitle>
          <DialogDescription>删除后无法恢复，回复的附件也会一并移除；其子回复会保留为一级回复。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
          <Button className="bg-[var(--rose-strong)] text-white" onClick={() => pendingDelete && void deleteReply(pendingDelete)}>确认删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function ReplyItem({ postId, reply, childReplies, currentUserId, authenticated, openReplyTo, onReply, onDelete, skills, knowledge, mentions, onSubmit }: {
  postId: string;
  reply: PostReply;
  childReplies: PostReply[];
  currentUserId?: string;
  authenticated: boolean;
  openReplyTo: string | null;
  onReply: (reply: PostReply) => void;
  onDelete: (id: string) => void;
  skills: PostReplyPanelProps["skills"];
  knowledge: PostReplyPanelProps["knowledge"];
  mentions: Mention[];
  onSubmit: (value: ComposerValue) => Promise<string | null>;
}) {
  return <div id={`reply-${reply.id}`} className="scroll-mt-24 rounded-2xl border border-[var(--hairline)] bg-white p-3">
    <ReplyBody postId={postId} reply={reply} canDelete={currentUserId === reply.authorUserId} authenticated={authenticated} mentions={mentions} onReply={onReply} onDelete={onDelete} />
    {authenticated && openReplyTo === reply.id && <InlineComposer reply={reply} rootId={reply.id} skills={skills} knowledge={knowledge} mentions={mentions} onSubmit={onSubmit} />}
    {childReplies.length > 0 && (
      <div className="mt-3 space-y-3 border-l-2 border-[var(--surface-3)] pl-3">
        {childReplies.map((child) => (
          <div key={child.id} id={`reply-${child.id}`} className="scroll-mt-24">
            <ReplyBody postId={postId} reply={child} canDelete={currentUserId === child.authorUserId} authenticated={authenticated} mentions={mentions} onReply={onReply} onDelete={onDelete} />
            {authenticated && openReplyTo === child.id && <InlineComposer reply={child} rootId={reply.id} skills={skills} knowledge={knowledge} mentions={mentions} onSubmit={onSubmit} />}
          </div>
        ))}
      </div>
    )}
  </div>;
}

function InlineComposer({ reply, rootId, skills, knowledge, mentions, onSubmit }: { reply: PostReply; rootId: string; skills: PostReplyPanelProps["skills"]; knowledge: PostReplyPanelProps["knowledge"]; mentions: Mention[]; onSubmit: (value: ComposerValue) => Promise<string | null> }) {
  const targetId = reply.authorType === "bot" ? reply.authorBotId : reply.authorUserId;
  const initialMention = targetId ? { targetType: reply.authorType === "bot" ? "bot" as const : "user" as const, targetId, name: reply.authorName } : undefined;
  return <div data-inline-reply-composer><ReplyComposer compact skills={skills} knowledge={knowledge} mentions={mentions} initialMention={initialMention} parentReplyId={rootId} onSubmit={onSubmit} /></div>;
}

function MessageIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
      <path d="M15.59 12.4V16.47C15.59 16.83 15.55 17.17 15.46 17.48C15.09 18.95 13.87 19.87 12.19 19.87H9.47L6.45 21.88C6 22.19 5.4 21.86 5.4 21.32V19.87C4.38 19.87 3.53 19.53 2.94 18.94C2.34 18.34 2 17.49 2 16.47V12.4C2 10.5 3.18 9.19 5 9.02C5.13 9.01 5.26 9 5.4 9H12.19C14.23 9 15.59 10.36 15.59 12.4Z" fill="currentColor" />
      <path d="M17.75 15.6C19.02 15.6 20.09 15.18 20.83 14.43C21.58 13.69 22 12.62 22 11.35V6.25C22 3.9 20.1 2 17.75 2H9.25C6.9 2 5 3.9 5 6.25V7C5 7.28 5.22 7.5 5.5 7.5H12.19C14.9 7.5 17.09 9.69 17.09 12.4V15.1C17.09 15.38 17.31 15.6 17.59 15.6H17.75Z" fill="currentColor" />
    </svg>
  );
}

function ReplyBody({ postId, reply, canDelete, authenticated, mentions, onReply, onDelete }: { postId: string; reply: PostReply; canDelete: boolean; authenticated: boolean; mentions: Mention[]; onReply: (reply: PostReply) => void; onDelete: (id: string) => void }) {
  const isPending = reply.id.startsWith("pending-");
  const mentionRefs = mergeMentionRefs(reply.mentionRefs, reply.content, mentions);
  const mentionNames = new Set(mentionRefs.map((mention) => mention.name));
  const botMentionIds = new Map(mentionRefs.filter((mention) => mention.targetType === "bot").map((mention) => [mention.name, mention.targetId]));
  return <>
    <div className="flex items-center gap-2">
      <span className={`mono inline-flex h-5 items-center rounded-full px-2 text-[0.65rem] font-semibold ${reply.authorType === "bot" ? "bg-[var(--rose-soft)] text-[var(--rose-strong)]" : "bg-[var(--blue-soft)] text-[var(--blue-strong)]"}`}>{reply.authorType === "bot" ? "虾" : "人"}</span>
      <span className="text-sm font-semibold text-[var(--text-primary)]">{reply.authorName}</span>
      {authenticated && !isPending && (
        <button type="button" data-reply-trigger onClick={() => onReply(reply)} className="flex size-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)]" aria-label={`回复 ${reply.authorName}`} title="回复"><MessageIcon /></button>
      )}
      <span className="mono ml-auto text-xs text-[var(--text-muted)]">{formatDate(reply.createdAt)}</span>
      {canDelete && !isPending && (
        <button type="button" onClick={() => onDelete(reply.id)} className="ml-2 flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--rose-soft)] hover:text-[var(--rose-strong)]" aria-label="删除回复"><Trash2 className="size-4" /></button>
      )}
    </div>
    {reply.content && <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{renderHighlightedContent(reply.content, new Set(), mentionNames, botMentionIds)}</p>}
    <ReplyResources postId={postId} reply={reply} />
  </>;
}

function ReplyResources({ postId, reply }: { postId: string; reply: PostReply }) {
  return <>
    {reply.skillRefs.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {reply.skillRefs.map((skill) => (
          <Link key={skill.id} href={`/library/skills/${skill.id}`} className="reply-resource-chip rounded-lg border border-[rgba(0,180,138,0.28)] bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-strong)] transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(42,67,101,0.16)]">/{skill.id} <span className="text-[var(--text-muted)]">{skill.title}</span></Link>
        ))}
      </div>
    )}
    {reply.knowledgeRefs.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {reply.knowledgeRefs.map((item) => (
          <Link key={item.id} href={`/library/knowledge/${item.id}`} className="reply-resource-chip inline-flex items-center gap-1 rounded-lg bg-[var(--amber-soft)] px-2 py-1 text-xs transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(42,67,101,0.16)]"><KnowledgeBookIcon className="size-3.5 text-[var(--amber-strong)]" />{item.title}</Link>
        ))}
      </div>
    )}
    {reply.attachments.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {reply.attachments.map((attachment) => <ReplyAttachmentChip key={attachment.id} postId={postId} attachment={attachment} />)}
      </div>
    )}
  </>;
}

function ReplyAttachmentChip({ postId, attachment }: { postId: string; attachment: ReplyAttachment }) {
  return (
    <a href={`/api/posts/${postId}/replies/assets/${attachment.id}`} className="reply-resource-chip flex items-center gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-xs transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(42,67,101,0.16)]">
      <Paperclip className="size-3.5" />
      <span className="max-w-[180px] truncate">{attachment.filename}</span>
      <span className="text-[var(--text-muted)]">{formatBytes(attachment.sizeBytes)}</span>
      <Download className="size-3.5" />
    </a>
  );
}
