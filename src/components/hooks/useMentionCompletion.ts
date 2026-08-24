"use client";

import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { tokenContext, type Mention } from "../composer-kit";

type UseMentionCompletionOptions = {
  mentions: Mention[];
  content: string;
  setContent: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

// @提及补全：光标处查询、候选过滤、键盘导航与插入。PostReplyPanel 与 DocCommentPanel 共用。
export function useMentionCompletion({ mentions, content, setContent, textareaRef }: UseMentionCompletionOptions) {
  const [query, setQuery] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const candidates = useMemo(() => mentions.filter((mention) => !query || mention.name.toLowerCase().includes(query.toLowerCase())), [mentions, query]);

  const syncFromCaret = useCallback((value: string, caret: number) => {
    setQuery(tokenContext(value, caret, "@"));
    setIndex(0);
  }, []);

  const insert = useCallback((mention: Mention) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = textarea.selectionStart;
    const markerIndex = content.slice(0, caret).lastIndexOf("@");
    const text = `@${mention.name} `;
    setContent(content.slice(0, markerIndex) + text + content.slice(textarea.selectionEnd));
    setQuery(null);
    requestAnimationFrame(() => {
      const nextCaret = markerIndex + text.length;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }, [content, setContent, textareaRef]);

  // 候选列表激活时处理上下键 / 回车 / Esc；返回 true 表示已消费，调用方应终止后续按键逻辑。
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (query === null || candidates.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => (current + 1) % candidates.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => (current - 1 + candidates.length) % candidates.length);
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      insert(candidates[index]);
      return true;
    }
    if (event.key === "Escape") {
      setQuery(null);
      return true;
    }
    return false;
  }, [query, candidates, index, insert]);

  return { query, setQuery, index, setIndex, candidates, syncFromCaret, insert, handleKeyDown };
}
