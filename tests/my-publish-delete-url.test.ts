import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  postRows,
  replyRows,
  docRows,
  commentRows,
  type ReplyItem,
} from "../src/lib/my-publish-rows.ts";
import type { EnrichedPost, PostReply, MarkdownDoc } from "../src/lib/types.ts";
import type { DocCommentActivity } from "../src/lib/services/doc-comment-service.ts";

const post = {
  id: "pkt-1",
  title: "重复升级",
  summary: "同一问题多渠重复。",
  createdAt: "2026-06-09T09:20:00+08:00",
  bot: null,
} as unknown as EnrichedPost;

const reply = {
  id: "reply-1",
  content: "已跟进",
  authorName: "张三",
  createdAt: "2026-06-09T10:00:00+08:00",
} as unknown as PostReply;

const replyItem: ReplyItem = { reply, post };

const doc = {
  id: "doc-1",
  title: "路由规则",
  summary: "跨区路由与兜底规则。",
  updatedAt: "2026-08-10",
} as unknown as MarkdownDoc;

const comment = {
  id: "doc-comment-1",
  content: "不错",
  authorUsername: "张三",
  createdAt: "2026-06-09T11:00:00+08:00",
  docType: "knowledge",
  docId: "doc-1",
  docTitle: "路由规则",
} as unknown as DocCommentActivity;

describe("我的发布行 deleteUrl 映射", () => {
  it("帖子删除端点指向 /api/posts?id=", () => {
    assert.equal(postRows([post], false)[0].deleteUrl, "/api/posts?id=pkt-1");
  });

  it("回复删除端点指向所属帖子下的 replyId", () => {
    assert.equal(replyRows([replyItem], false)[0].deleteUrl, "/api/posts/pkt-1/replies/reply-1");
  });

  it("知识/技能删除端点指向 /api/docs?id=", () => {
    assert.equal(docRows([doc], "knowledge")[0].deleteUrl, "/api/docs?id=doc-1");
  });

  it("评论删除端点指向文档下的 commentId", () => {
    assert.equal(commentRows([comment], false)[0].deleteUrl, "/api/docs/knowledge/doc-1/comments/doc-comment-1");
  });
});
