import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "../db.ts";

export const SESSION_COOKIE = "shrimp_session";
export const SESSION_TTL_DAYS = 30;

export type UserRole = "member" | "admin";

export type SessionUser = { id: string; username: string; role: UserRole };

type SessionRow = {
  id: string;
  user_id: string;
  username: string;
  role: UserRole;
  expires_at: string;
};

// 破坏性 / 治理性动作（删帖、删文档、删机器人、审核 / 撤销审核）的授权判定。
// 未登录 → 401；登录但非管理员 → 403。成功时回带 narrowed 后的用户，方便调用方
// 直接取 username 等字段而不必再判空。纯函数，便于测试覆盖授权矩阵。
export function requireAdmin(user: SessionUser | null):
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; error: string } {
  if (!user) {
    return { ok: false, status: 401, error: "请先登录后再操作" };
  }
  if (user.role !== "admin") {
    return { ok: false, status: 403, error: "需要管理员权限" };
  }
  return { ok: true, user };
}

// 高熵会话 token：UUID + 32 字节随机量拼合，作为 cookie 值兼 sessions 主键。
function generateSessionId(): string {
  return `${randomUUID()}${randomBytes(32).toString("hex")}`;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: string }> {
  const sql = getSql();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const id = generateSessionId();
  await sql`
    insert into sessions (id, user_id, created_at, expires_at)
    values (${id}, ${userId}, ${now.toISOString()}, ${expiresAt.toISOString()})
  `;
  return { id, expiresAt: expiresAt.toISOString() };
}

// 从 cookie 头解析会话并返回当前用户。供 API 路由（持 Request）与服务端页面
// （持 next/headers 的 cookies()）共用。
export async function getUserFromCookie(cookieHeader: string): Promise<SessionUser | null> {
  const sessionId = readCookie(cookieHeader, SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const sql = getSql();
  const rows = (await sql`
    select s.id, s.expires_at, u.id as user_id, u.username, u.role
    from sessions s join users u on u.id = s.user_id
    where s.id = ${sessionId}
  `) as SessionRow[];
  const row = rows[0];
  if (!row) {
    return null;
  }

  // 过期：惰性删除并视为未登录。
  if (Date.parse(row.expires_at) < Date.now()) {
    await sql`delete from sessions where id = ${sessionId}`;
    return null;
  }

  return { id: row.user_id, username: row.username, role: row.role };
}

export async function getCurrentUser(request: Request): Promise<SessionUser | null> {
  return getUserFromCookie(request.headers.get("cookie") ?? "");
}

export async function destroySession(sessionId: string): Promise<void> {
  const sql = getSql();
  await sql`delete from sessions where id = ${sessionId}`;
}

// 清掉该用户的全部会话：改密码 / 改用户名等凭据变更后调用，使旧会话（含可能被
// 盗用的）一律失效，再由调用方建新会话下发新 cookie。
export async function destroyUserSessions(userId: string): Promise<void> {
  const sql = getSql();
  await sql`delete from sessions where user_id = ${userId}`;
}

// 取当前会话 id（用于登出时删 session 行，不必再查一次用户）。
export function readSessionId(request: Request): string | null {
  return readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE);
}

function buildCookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function buildSessionCookie(id: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${id}; ${buildCookieAttributes(maxAge)}`;
}

export function buildClearedCookie(): string {
  // Max-Age=0 立即过期，清除浏览器侧 cookie。
  return `${SESSION_COOKIE}=; ${buildCookieAttributes(0)}`;
}

// 极简 cookie 解析：按 "; " 分割取 name=value。足够读单个会话 cookie。
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }
  return null;
}
