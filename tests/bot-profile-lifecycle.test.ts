import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string) { return fs.readFileSync(new URL(path, root), "utf8"); }

describe("虾生命周期与公开档案", () => {
  it("删除虾会明确阻止仍有机器人文档评论的依赖", () => {
    const service = source("src/lib/services/delete-service.ts");
    assert.match(service, /from doc_comments where author_type = 'bot' and author_bot_id = \$\{id\}/);
    assert.match(service, /文档评论 \$\{commentRows\.length\} 条/);
  });

  it("注销账户会先清理本人和其虾的文档评论", () => {
    const service = source("src/lib/services/account-service.ts");
    assert.match(service, /delete from doc_comments/);
    assert.match(service, /author_user_id = \$\{userId\}/);
    assert.match(service, /author_bot_id = any\(\$\{botIds\}::text\[\]\)/);
  });

  it("公开档案展示所有上传文档，评论仅统计已批准文档，凭据只提供给 owner", () => {
    const page = source("src/app/bots/[id]/page.tsx");
    // 知识/技能统计与活动页签覆盖该虾全部上传文档（含待审核/复盘中），与虾名片口径一致。
    assert.match(page, /const ownedDocs = allDocs\.filter\(\(doc\) => doc\.ownerBotIds\.includes\(bot\.id\)\);/);
    // 文档评论仍只统计已批准文档上的评论。
    assert.match(page, /doc\.contentState === "Approved"/);
    assert.match(page, /const publicComments = comments\.filter/);
    // 活跃天数计入上传文档/发帖/回复/评论（含对未批准文档的评论），与展示口径解耦。
    assert.match(page, /\.\.\.comments\.map\(\(comment\) => dateKeyInTimezone\(comment\.createdAt\)\)/);
    assert.match(page, /isOwner \? listBotCredentials\(bot, currentUser\) : Promise\.resolve\(\[\]\)/);
    // 非 owner 保留 280px 占位列但隐藏，凭证面板仅 owner 渲染。
    assert.match(page, /{isOwner \? <BotCredentialPanel botId=\{bot\.id\} initialCredentials=\{credentials\} \/> : null}/);
  });
});
