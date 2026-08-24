import { randomUUID } from "node:crypto";
import { getBots } from "../content.ts";
import { insertBot, updateBotRow } from "../content-mutations.ts";
import { botInputSchema, botUpdateSchema, type BotInput, type BotUpdate } from "./schemas.ts";
import type { SessionUser } from "./session.ts";
import type { ZodError } from "zod";
import type { Bot } from "../types";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// 新虾 id 自动生成：bot- + randomUUID 前 12 位。与 auth-service 的 randomUUID 同源。
export function makeBotId(): string {
  return `bot-${randomUUID().slice(0, 12)}`;
}

// 虾的编辑/删除授权（纯函数，便于单测覆盖授权矩阵）。
//   - 未登录：401。
//   - owner 本人：允许。
//   - 其余（含管理员越权、含 ownerUserId=null 的种子虾）：403。
// 种子虾无 owner → 谁都不能改删，成为只读历史数据。
export function canUpdateBot(
  currentUser: SessionUser | null,
  ownerUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (ownerUserId !== null && ownerUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能管理自己的虾" };
}

export function canDeleteBot(
  currentUser: SessionUser | null,
  ownerUserId: string | null,
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!currentUser) {
    return { allowed: false, status: 401, error: "请先登录后再操作" };
  }
  if (ownerUserId !== null && ownerUserId === currentUser.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: "只能管理自己的虾" };
}

// 创建虾。id 未提供时自动生成；ownerUserId 由服务端从会话写入（不信任前端）。
// master 缺省空串（注册表单不采集）。allowOverwrite 仅供种子/覆盖场景。
export async function createBot(
  input: unknown,
  currentUser: SessionUser | null,
  options: { allowOverwrite?: boolean } = {},
): Promise<ServiceResult<Bot>> {
  const parsed = botInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }

  const value: BotInput = parsed.data;
  const id = value.id ?? makeBotId();
  const existing = await getBots();
  if (!options.allowOverwrite && existing.some((bot) => bot.id === id)) {
    return { ok: false, error: `bot id already exists: ${id}` };
  }

  const bot: Bot = {
    id,
    name: value.name,
    role: value.role,
    master: value.master,
    summary: value.summary,
    domains: value.domains,
    version: value.version,
    model: value.model,
    ownerUserId: currentUser?.id ?? null,
    // DB 侧 created_at 走 default now()（insertBot 不写该列），此处用当前时刻近似，
    // 真实值以 router.refresh 后从 DB 读回的为准。
    createdAt: new Date().toISOString(),
  };

  await insertBot(bot);
  return { ok: true, data: bot };
}

// 编辑虾：仅 owner 可改 name/role/summary/domains（id/ownerUserId/master 不动）。
export async function updateBot(
  id: string,
  input: unknown,
  currentUser: SessionUser | null,
): Promise<ServiceResult<Bot> | { ok: false; status: number; error: string }> {
  const parsed = botUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const value: BotUpdate = parsed.data;

  const bots = await getBots();
  const bot = bots.find((item) => item.id === id);
  if (!bot) {
    return { ok: false, status: 404, error: `bot not found: ${id}` };
  }

  const decision = canUpdateBot(currentUser, bot.ownerUserId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  const updated = await updateBotRow(id, value);
  if (!updated) {
    return { ok: false, status: 404, error: `bot not found: ${id}` };
  }

  return {
    ok: true,
    data: { ...bot, name: value.name, role: value.role, summary: value.summary, domains: value.domains, version: value.version, model: value.model },
  };
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
