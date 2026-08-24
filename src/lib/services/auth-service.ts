import { getSql } from "../db.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { createSession, destroySession, destroyUserSessions, type SessionUser, type UserRole } from "./session.ts";
import { formatZodError, type ServiceResult } from "./bot-service.ts";
import { loginInputSchema, registerInputSchema, passwordSchema, usernameSchema, type LoginInput, type RegisterInput } from "./schemas.ts";
import { randomUUID } from "node:crypto";

export type AuthResult = { user: SessionUser; sessionId: string; expiresAt: string };

// 首位用户自举为管理员：空库时第一个注册者获 admin，其余为 member。
// 抽成纯函数便于测试；registerUser 传入当前用户数。
export function decideRoleForNewUser(existingCount: number): UserRole {
  return existingCount === 0 ? "admin" : "member";
}

// 自助注册：校验用户名/密码 → 唯一性 → 哈希 → 写用户 → 建会话（注册即登录）。
export async function registerUser(input: unknown): Promise<ServiceResult<AuthResult>> {
  const parsed = registerInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const value: RegisterInput = parsed.data;

  const sql = getSql();
  // 先查唯一性，给出友好错误；依赖 users.username 的 unique 约束兜底并发。
  const existing = (await sql`select id from users where username = ${value.username}`) as Array<{ id: string }>;
  if (existing.length > 0) {
    return { ok: false, error: "用户名已被占用" };
  }

  // 角色由当前用户数决定（空库 → admin）。与 014 迁移的自举一致。
  const userCount = (await sql`select count(*)::int as n from users`) as Array<{ n: number }>;
  const role = decideRoleForNewUser(userCount[0]?.n ?? 0);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = await hashPassword(value.password);
  try {
    await sql`
      insert into users (id, username, password_hash, created_at, role)
      values (${id}, ${value.username}, ${passwordHash}, ${createdAt}, ${role})
    `;
  } catch {
    // 并发下 unique 冲突也归一为"已被占用"。
    return { ok: false, error: "用户名已被占用" };
  }

  const session = await createSession(id);
  return {
    ok: true,
    data: { user: { id, username: value.username, role }, sessionId: session.id, expiresAt: session.expiresAt },
  };
}

// 登录：查用户 → 校验密码 → 建会话。
// 用户不存在 / 密码错误返回同一条模糊错误，不泄露账号是否存在。
export async function loginUser(input: unknown): Promise<ServiceResult<AuthResult>> {
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const value: LoginInput = parsed.data;

  const sql = getSql();
  const rows = (await sql`select id, username, password_hash, role from users where username = ${value.username}`) as Array<{
    id: string;
    username: string;
    password_hash: string;
    role: UserRole;
  }>;
  const user = rows[0];
  // 无论用户是否存在都走完校验流程；用户不存在时用一个永远不匹配的占位哈希参与比较，
  // 让两条路径耗时接近，进一步降低时序侧信道。
  const placeholder = "scrypt$00000000000000000000000000000000$" + "00".repeat(64);
  const ok = await verifyPassword(value.password, user?.password_hash ?? placeholder);

  if (!user || !ok) {
    return { ok: false, error: "用户名或密码错误" };
  }

  const session = await createSession(user.id);
  return {
    ok: true,
    data: { user: { id: user.id, username: user.username, role: user.role }, sessionId: session.id, expiresAt: session.expiresAt },
  };
}

// 登出：删会话行。未知 sessionId 也视为成功（幂等）。
export async function logoutUser(sessionId: string | null): Promise<ServiceResult<void>> {
  if (sessionId) {
    await destroySession(sessionId);
  }
  return { ok: true, data: undefined };
}

// 修改密码：校验旧密码 → 校验新密码规则 → 重新哈希写入。
// 旧密码不匹配返回"当前密码错误"；新密码不合规返回 zod 文案。
// 成功后轮换会话：清掉该用户全部旧会话（含可能被盗用的），建新会话回传给
// 调用方下发新 cookie——凭据变更即作废旧 session。
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ServiceResult<{ sessionId: string; expiresAt: string }>> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const sql = getSql();
  const rows = (await sql`select password_hash from users where id = ${userId}`) as Array<{
    password_hash: string;
  }>;
  const user = rows[0];
  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    return { ok: false, error: "当前密码错误" };
  }

  const newHash = await hashPassword(parsed.data);
  await sql`update users set password_hash = ${newHash} where id = ${userId}`;
  await destroyUserSessions(userId);
  const session = await createSession(userId);
  return { ok: true, data: { sessionId: session.id, expiresAt: session.expiresAt } };
}

export async function resetPasswordWithRecoveryGrant(
  userId: string,
  newPassword: string,
): Promise<ServiceResult<{ sessionId: string; expiresAt: string }>> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const sql = getSql();
  const rows = (await sql`select id from users where id = ${userId}`) as Array<{ id: string }>;
  if (!rows[0]) {
    return { ok: false, error: "用户不存在" };
  }

  const newHash = await hashPassword(parsed.data);
  await sql`update users set password_hash = ${newHash} where id = ${userId}`;
  await destroyUserSessions(userId);
  const session = await createSession(userId);
  return { ok: true, data: { sessionId: session.id, expiresAt: session.expiresAt } };
}

// 取用户公开信息（用户名 + 注册时间 + 角色），供用户中心展示。
export async function getUserProfile(
  userId: string,
): Promise<{ id: string; username: string; createdAt: string; role: UserRole } | null> {
  const sql = getSql();
  const rows = (await sql`select id, username, created_at, role from users where id = ${userId}`) as Array<{
    id: string;
    username: string;
    created_at: string;
    role: UserRole;
  }>;
  const row = rows[0];
  return row ? { id: row.id, username: row.username, createdAt: row.created_at, role: row.role } : null;
}

// 修改用户名：校验新用户名 → 唯一性 → 更新 users.username，并同步刷新历史内容里
// 冗余存储的旧名字（post_replies.author_name 与 posts.reviewer），保证全站显示一致。
// 用户名唯一约束兜底并发冲突；reviewer 按"旧名字"匹配（名字唯一，不会误伤他人）。
// 成功后轮换会话（凭据变更即作废旧 session），回传新会话供调用方下发 cookie。
export async function changeUsername(
  userId: string,
  newUsername: string,
): Promise<ServiceResult<{ sessionId: string; expiresAt: string }>> {
  const parsed = usernameSchema.safeParse(newUsername);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const next = parsed.data;

  const sql = getSql();
  const rows = (await sql`select username from users where id = ${userId}`) as Array<{
    username: string;
  }>;
  const user = rows[0];
  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  // 新旧同名：无需任何写入，但仍轮换会话（本就是凭据操作，统一处理）。
  if (next === user.username) {
    await destroyUserSessions(userId);
    const session = await createSession(userId);
    return { ok: true, data: { sessionId: session.id, expiresAt: session.expiresAt } };
  }

  // 唯一性：排除自己后查重。
  const clash = (await sql`select id from users where username = ${next} and id <> ${userId}`) as Array<{
    id: string;
  }>;
  if (clash.length > 0) {
    return { ok: false, error: "用户名已被占用" };
  }

  const oldUsername = user.username;
  await sql`update users set username = ${next} where id = ${userId}`;
  // 同步该用户历史回复的展示名。
  await sql`update post_replies set author_name = ${next} where author_user_id = ${userId}`;
  // 同步该用户审核记录的审核人名（按旧名匹配，名字唯一故不误伤）。
  await sql`update posts set reviewer = ${next} where reviewer = ${oldUsername}`;
  await destroyUserSessions(userId);
  const session = await createSession(userId);
  return { ok: true, data: { sessionId: session.id, expiresAt: session.expiresAt } };
}
