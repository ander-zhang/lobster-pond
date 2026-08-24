import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql } from "../db.ts";
import type { Bot } from "../types.ts";
import type { SessionUser } from "./session.ts";

export type BotCredential = { id: string; botId: string; name: string; token: string };
export type BotCredentialInfo = {
  id: string;
  botId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
export type BotAuthPrincipal = { credentialId: string; bot: Bot; owner: SessionUser };

type CredentialRow = {
  credential_id: string;
  bot_id: string;
  bot_name: string;
  bot_role: Bot["role"];
  bot_master: string;
  bot_summary: string;
  bot_domains: string[];
  bot_owner_user_id: string | null;
  bot_version: string;
  bot_model: string;
  bot_created_at: string | null;
  user_id: string | null;
  username: string | null;
  user_role: SessionUser["role"] | null;
};

type CredentialInfoRow = {
  id: string;
  bot_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function extractBotToken(authHeader: string | null, lobsterTokenHeader?: string | null): string | null {
  // 直连模式：从 Authorization Bearer 头读取
  const fromAuth = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (fromAuth) return fromAuth;
  // 网关模式：网关可能吞掉 Authorization 头，回退到 X-Lobster-Token
  if (lobsterTokenHeader?.startsWith("lp_bot_")) return lobsterTokenHeader.trim();
  return null;
}

function rowToBot(row: CredentialRow): Bot {
  return {
    id: row.bot_id,
    name: row.bot_name,
    role: row.bot_role,
    master: row.bot_master,
    ownerUserId: row.bot_owner_user_id,
    summary: row.bot_summary,
    domains: row.bot_domains,
    version: row.bot_version,
    model: row.bot_model,
    createdAt: row.bot_created_at,
  };
}

// 创建虾的 Bot Token。完整 token 只返回这一次，数据库只保存哈希。
export async function createBotCredential(bot: Bot, currentUser: SessionUser, name = "Token"): Promise<BotCredential> {
  if (!bot.ownerUserId || bot.ownerUserId !== currentUser.id) {
    throw new Error("只能为自己的虾创建 Bot Token");
  }
  const id = `cred-${randomUUID().slice(0, 12)}`;
  const token = `lp_bot_${id}_${randomBytes(24).toString("base64url")}`;
  const sql = getSql();
  const activeRows = await sql`
    select id from bot_credentials where bot_id = ${bot.id} and revoked_at is null limit 1
  `;
  if (activeRows.length > 0) {
    throw new Error("该虾已有生效中的 Token，请先撤销旧 Token 后再生成");
  }
  try {
    await sql`
      insert into bot_credentials (id, bot_id, name, token_hash)
      values (${id}, ${bot.id}, ${name.trim() || "Bot Token"}, ${hashToken(token)})
    `;
  } catch (error) {
    if (error instanceof Error && error.message.includes("bot_credentials_one_active_per_bot_idx")) {
      throw new Error("该虾已有生效中的 Token，请先撤销旧 Token 后再生成");
    }
    throw error;
  }
  return { id, botId: bot.id, name: name.trim() || "Bot Token", token };
}

export async function listBotCredentials(bot: Bot, currentUser: SessionUser): Promise<BotCredentialInfo[]> {
  if (!bot.ownerUserId || bot.ownerUserId !== currentUser.id) throw new Error("只能查看自己的虾凭据");
  const sql = getSql();
  const rows = (await sql`
    select id, bot_id, name, created_at, last_used_at, revoked_at
    from bot_credentials where bot_id = ${bot.id} order by created_at desc
  `) as CredentialInfoRow[];
  return rows.map((row) => ({
    id: row.id,
    botId: row.bot_id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
}

export async function revokeBotCredential(bot: Bot, credentialId: string, currentUser: SessionUser): Promise<boolean> {
  if (!bot.ownerUserId || bot.ownerUserId !== currentUser.id) throw new Error("只能撤销自己的虾凭据");
  const sql = getSql();
  const result = await sql.query(
    "update bot_credentials set revoked_at = coalesce(revoked_at, now()) where id = $1 and bot_id = $2",
    [credentialId, bot.id],
  );
  return (result.rowCount ?? 0) > 0;
}

// 从 Bearer 头解析出具体虾和其 owner。明文 token 不写入日志或返回值。
export async function authenticateBotRequest(
  authHeader: string | null,
  lobsterTokenHeader?: string | null,
): Promise<{ ok: true; principal: BotAuthPrincipal } | { ok: false; status: number; error: string }> {
  const token = extractBotToken(authHeader, lobsterTokenHeader);
  if (!token || !token.startsWith("lp_bot_")) {
    return { ok: false, status: 401, error: "Bot 请求需要在 X-Lobster-Token 或 Authorization 头携带有效的 Bot Token" };
  }

  let rows: CredentialRow[];
  try {
    const sql = getSql();
    rows = (await sql`
      select c.id as credential_id, b.id as bot_id, b.name as bot_name, b.role as bot_role,
        b.master as bot_master, b.summary as bot_summary, b.domains as bot_domains,
        b.owner_user_id as bot_owner_user_id, b.version as bot_version, b.model as bot_model,
        b.created_at as bot_created_at, u.id as user_id, u.username, u.role as user_role
      from bot_credentials c join bots b on b.id = c.bot_id
      left join users u on u.id = b.owner_user_id
      where c.token_hash = ${hashToken(token)} and c.revoked_at is null limit 1
    `) as CredentialRow[];
  } catch {
    return { ok: false, status: 503, error: "Bot 鉴权服务暂不可用" };
  }

  const row = rows[0];
  if (!row || !row.user_id || !row.username || !row.user_role) {
    return { ok: false, status: 401, error: "Bot Token 无效或已撤销" };
  }
  const sql = getSql();
  try {
    await sql`update bot_credentials set last_used_at = now() where id = ${row.credential_id}`;
  } catch (error) {
    // 审计时间写入失败不应把已经通过凭据校验的业务请求变成失败请求。
    console.error("[bot-credential] failed to update last_used_at:", error);
  }
  return {
    ok: true,
    principal: {
      credentialId: row.credential_id,
      bot: rowToBot(row),
      owner: { id: row.user_id, username: row.username, role: row.user_role },
    },
  };
}
