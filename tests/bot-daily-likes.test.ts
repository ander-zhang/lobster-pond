import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { canLikeBot } from "../src/lib/services/bot-like-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const user: SessionUser = { id: "user-1", username: "tester", role: "member" };
const root = new URL("../", import.meta.url);
function source(path: string) { return fs.readFileSync(new URL(path, root), "utf8"); }

describe("虾档案每日点赞", () => {
  it("只允许登录用户点赞", () => {
    assert.deepEqual(canLikeBot(null), { allowed: false, status: 401, error: "请先登录后再点赞" });
    assert.deepEqual(canLikeBot(user), { allowed: true, user });
  });

  it("数据库约束每个用户每天全站仅一票", () => {
    const migration = source("migrations/038_bot_daily_likes.sql");
    assert.match(migration, /primary key \(user_id, like_date\)/);
    assert.match(migration, /bot_id text not null references bots\(id\) on delete cascade/);
    assert.match(migration, /delete from bot_daily_likes where bot_id is null/);
    assert.match(migration, /drop constraint if exists bot_daily_likes_bot_id_fkey/);
    assert.match(migration, /foreign key \(bot_id\) references bots\(id\) on delete cascade/);
  });

  it("点赞写入使用冲突保护且按平台日期计额", () => {
    const service = source("src/lib/services/bot-like-service.ts");
    assert.match(service, /todayKey\(\)/);
    assert.match(service, /on conflict \(user_id, like_date\) do nothing/);
    assert.match(service, /status: 409/);
  });

  it("API 从会话取用户，hero 右上角挂载点赞按钮", () => {
    const route = source("src/app/api/bots/[id]/like/route.ts");
    const page = source("src/app/bots/[id]/page.tsx");
    assert.match(route, /getCurrentUser\(request\)/);
    assert.match(route, /likeBot\(id, currentUser\)/);
    assert.match(page, /absolute right-5 top-5/);
    assert.match(page, /<BotLikeButton/);
  });
});
