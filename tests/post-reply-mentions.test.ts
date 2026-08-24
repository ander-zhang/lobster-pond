import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("问题帖回复艾特展示", () => {
  it("ReplyBody 使用持久化 mentionRefs 高亮有效艾特", async () => {
    const source = await readFile(new URL("../src/components/PostReplyPanel.tsx", import.meta.url), "utf8");
    const kit = await readFile(new URL("../src/components/composer-kit.tsx", import.meta.url), "utf8");
    const replyBody = source.slice(source.indexOf("function ReplyBody"), source.indexOf("function ReplyResources"));
    assert.match(replyBody, /new Set\((?:reply\.mentionRefs|mentionRefs)\.map\(\(mention\) => mention\.name\)\)/);
    assert.match(replyBody, /new Map\(mentionRefs\.filter\(\(mention\) => mention\.targetType === "bot"\)/);
    assert.match(replyBody, /mergeMentionRefs\(reply\.mentionRefs, reply\.content, mentions\)/);
    assert.match(kit, /href=\{`\/bots\/\$\{encodeURIComponent\(botId\)\}`\}/);
    assert.match(replyBody, /renderHighlightedContent\(reply\.content, new Set\(\), mentionNames, botMentionIds\)/);
  });

  it("回复输入框的高亮镜像与真实输入层保持相同字体度量和滚动位置", async () => {
    const source = await readFile(new URL("../src/components/PostReplyPanel.tsx", import.meta.url), "utf8");
    const kit = await readFile(new URL("../src/components/composer-kit.tsx", import.meta.url), "utf8");
    assert.match(source, /data-input-mirror/);
    assert.match(source, /font-normal leading-6 tracking-normal/);
    assert.match(source, /overflow-y-auto \[scrollbar-gutter:stable\]/);
    assert.match(source, /onScroll=\{syncComposerScroll\}/);
    assert.match(source, /syncMirrorScroll\(textareaRef, mirrorRef\)/);
    assert.match(kit, /mirrorRef\.current\.scrollTop = textareaRef\.current\.scrollTop/);
  });

  it("提及补全走共享 hook（候选过滤、键盘导航、插入）", async () => {
    const source = await readFile(new URL("../src/components/PostReplyPanel.tsx", import.meta.url), "utf8");
    const hook = await readFile(new URL("../src/components/hooks/useMentionCompletion.ts", import.meta.url), "utf8");
    assert.match(source, /useMentionCompletion\(\{ mentions, content, setContent, textareaRef \}\)/);
    assert.match(source, /mentionCompletion\.handleKeyDown\(event\)/);
    assert.match(hook, /event\.key === "ArrowDown"/);
    assert.match(hook, /tokenContext\(value, caret, "@"\)/);
  });

  it("点击行内回复框以外的位置会收起输入框", async () => {
    const source = await readFile(new URL("../src/components/PostReplyPanel.tsx", import.meta.url), "utf8");
    assert.match(source, /if \(!openReplyTo\) return/);
    assert.match(source, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(source, /target\.closest\("\[data-inline-reply-composer\]"\)/);
    assert.match(source, /target\.closest\("\[data-reply-trigger\]"\)/);
    assert.match(source, /setOpenReplyTo\(null\)/);
    assert.match(source, /document\.removeEventListener\("pointerdown", handlePointerDown\)/);
  });
});
