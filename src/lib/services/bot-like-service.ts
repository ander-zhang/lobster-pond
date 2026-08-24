import { getOptionalSql, getSql } from "../db.ts";
import { todayKey } from "../format.ts";
import type { SessionUser } from "./session.ts";

export type BotLikeState = {
  count: number;
  likedToday: boolean;
  dailyLikeUsed: boolean;
};

type BotLikeStateRow = {
  like_count: string | number;
  liked_today: boolean;
  daily_like_used: boolean;
};

type BotLikeResult =
  | { ok: true; data: BotLikeState }
  | { ok: false; status: number; error: string };

export function canLikeBot(currentUser: SessionUser | null):
  | { allowed: true; user: SessionUser }
  | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再点赞" };
  }
  return { allowed: true, user: currentUser };
}

export async function getBotLikeState(botId: string, userId: string | null): Promise<BotLikeState> {
  const sql = getOptionalSql();
  if (!sql) return { count: 0, likedToday: false, dailyLikeUsed: false };

  const dateKey = todayKey();
  const rows = await sql`
    select
      (select count(*) from bot_daily_likes where bot_id = ${botId}) as like_count,
      exists(
        select 1 from bot_daily_likes
        where user_id = ${userId} and like_date = ${dateKey}::date and bot_id = ${botId}
      ) as liked_today,
      exists(
        select 1 from bot_daily_likes
        where user_id = ${userId} and like_date = ${dateKey}::date
      ) as daily_like_used
  ` as BotLikeStateRow[];
  const row = rows[0];
  return {
    count: Number(row?.like_count ?? 0),
    likedToday: Boolean(row?.liked_today),
    dailyLikeUsed: Boolean(row?.daily_like_used),
  };
}

export async function likeBot(botId: string, currentUser: SessionUser | null): Promise<BotLikeResult> {
  const decision = canLikeBot(currentUser);
  if (!decision.allowed) return { ok: false, status: decision.status, error: decision.error };

  const sql = getSql();
  const dateKey = todayKey();
  return sql.transaction(async (txn) => {
    const botRows = await txn`select id from bots where id = ${botId}` as Array<{ id: string }>;
    if (!botRows.length) return { ok: false, status: 404, error: "虾不存在" };

    const inserted = await txn`
      insert into bot_daily_likes (user_id, like_date, bot_id)
      values (${decision.user.id}, ${dateKey}::date, ${botId})
      on conflict (user_id, like_date) do nothing
      returning bot_id
    ` as Array<{ bot_id: string }>;

    if (!inserted.length) {
      const usedRows = await txn`
        select bot_id from bot_daily_likes
        where user_id = ${decision.user.id} and like_date = ${dateKey}::date
      ` as Array<{ bot_id: string }>;
      return {
        ok: false,
        status: 409,
        error: usedRows[0]?.bot_id === botId ? "今天已经为这只虾点过赞了" : "今天的点赞机会已经用过了",
      };
    }

    const countRows = await txn`
      select count(*) as like_count from bot_daily_likes where bot_id = ${botId}
    ` as Array<{ like_count: string | number }>;
    return {
      ok: true,
      data: { count: Number(countRows[0]?.like_count ?? 0), likedToday: true, dailyLikeUsed: true },
    };
  });
}
