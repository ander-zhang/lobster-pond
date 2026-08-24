import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("文档评论艾特契约", () => {
  it("详情页加载艾特候选并传给评论组件", async () => {
    const page = await source("../src/app/library/[type]/[id]/page.tsx");
    // 艾特候选按当前查看者过滤（隔离模式只出演示账号与可见虾），调用须传 viewer。
    assert.match(page, /getMentionCandidates\(currentUser\?\.id \?\? null\)/);
    assert.match(page, /mentions=\{mentionCandidates\}/);
  });

  it("评论组件提供艾特选择、键盘操作并提交 mentionRefs", async () => {
    const panel = await source("../src/components/DocCommentPanel.tsx");
    const kit = await source("../src/components/composer-kit.tsx");
    const hook = await source("../src/components/hooks/useMentionCompletion.ts");
    assert.match(panel, /useMentionCompletion\(/);
    assert.match(hook, /event\.key === "ArrowDown"/);
    assert.match(hook, /tokenContext\(value, caret, "@"\)/);
    assert.match(panel, /body: JSON\.stringify\(\{ content, mentionRefs, \.\.\.\(replyTarget \? \{ parentCommentId: replyTarget\.id \} : \{\}\) \}\)/);
    assert.match(panel, /renderCommentContent\(content, mentions, false\)/);
    assert.match(panel, /data-input-mirror/);
    assert.match(panel, /font-normal leading-6 tracking-normal/);
    assert.match(panel, /resize-none overflow-y-auto \[scrollbar-gutter:stable\]/);
    assert.match(panel, /onScroll=\{syncComposerScroll\}/);
    assert.match(panel, /targetType === "bot"/);
    assert.match(panel, /renderMentionToken\(mentionName, Boolean\(mention\)/);
    assert.match(kit, /href=\{`\/bots\/\$\{encodeURIComponent\(botId\)\}`\}/);
    assert.match(panel, /aria-label=\{`回复 \$\{comment\.authorUsername\}`\}/);
    assert.match(panel, /function ReplyIcon\(\)/);
    assert.match(panel, /<ReplyIcon \/>/);
    assert.match(panel, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(panel, /if \(!composerOpen\) return/);
    assert.match(panel, /composerRef\.current\?\.contains\(target\)/);
    assert.match(panel, /composerTriggerRef\.current\?\.contains\(target\)/);
    assert.match(panel, /target\.closest\("\[data-comment-reply-trigger\]"\)/);
    assert.match(panel, /composerOpen && replyTarget\?\.id === comment\.id/);
    assert.match(panel, /setComposerOpen\(false\)/);
    assert.match(panel, /data-comment-reply-trigger/);
    assert.match(panel, /composerOpen && replyTarget\?\.id === comment\.id \? composer : null/);
    assert.match(panel, /composerOpen && !replyTarget \? composer : null/);
    assert.match(panel, /setComposerOpen\(false\)/);
    assert.match(panel, /comment\.parentCommentId === root\.id/);
    assert.match(panel, /parentCommentId: null/);
  });

  it("服务端重新解析用户和虾并写入艾特与多接收人提醒", async () => {
    const service = await source("../src/lib/services/doc-comment-service.ts");
    assert.match(service, /select id, username from users where username = any/);
    // 虾提名须名字匹配（可见性过滤后保留该契约：不可见提名视同未命中）。
    assert.match(service, /target\.name !== mention\.name\.trim\(\)/);
    assert.match(service, /insert into doc_comment_mentions/);
    assert.match(service, /where c\.id = \$\{parsed\.data\.parentCommentId\} and c\.doc_id = \$\{docId\}/);
    assert.match(service, /parent_comment_id/);
    assert.match(service, /replyTarget\.author_user_id/);
    assert.match(service, /kind: recipientUserId === ownerRecipient \? "comment" : "mention"/);
  });

  it("消息中心区分评论提醒和评论艾特提醒", async () => {
    const popover = await source("../src/components/NotificationPopover.tsx");
    assert.match(popover, /notification\.kind === "mention" \? " 在评论中提到了你"/);
  });
});
