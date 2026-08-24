import { NextResponse } from "next/server";
import { requireUser } from "@/lib/route-auth";
import { getOptionalSql } from "@/lib/db";
import { getVisibilityContext, publicAccountNames } from "@/lib/visibility";

export const dynamic = "force-dynamic";

// 注册用户名单：转审弹窗选择被转审人用。要求登录（未登录 401）——
// 用户名对已登录用户本就可见（评论艾特候选名单 getMentionCandidates 同口径），
// 但不向匿名访客额外暴露。
// 隔离模式（公开演示）下只返回演示账号，收口普通用户名暴露面；互通模式全量不变。
export async function GET(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;
  const sql = getOptionalSql();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "数据库不可用，无法获取用户名单" }, { status: 503 });
  }
  const ctx = await getVisibilityContext();
  const rows = ctx.isolated
    ? (await sql`select id, username from users where username = any(${publicAccountNames()}) order by username asc`) as Array<{ id: string; username: string }>
    : (await sql`select id, username from users order by username asc`) as Array<{ id: string; username: string }>;
  return NextResponse.json({ ok: true, users: rows });
}
