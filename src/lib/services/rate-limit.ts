// 限流。两条路径：
//   - 有 DATABASE_URL：用 rate_limit_buckets 表做原子 upsert 计数，跨实例共享，
//     Vercel 多实例 / 冷启动下仍生效（/cso Finding 3）。
//   - 无 DATABASE_URL（本地 / 测试）：回退进程内 Map，单实例有效。
// 按 key 计数，窗口内超过 max 即拒绝，惰性清理过期条目。
//
// 用于登录/注册等敏感入口，降低暴力破解与撞库、批量注册的在线攻击面。
// 限流参数默认值可经环境变量覆盖（见 getRateLimitConfig），便于部署期调参。

import { getOptionalSql } from "../db.ts";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_MAX = 10;
const DEFAULT_REGISTER_MAX = 5;
const DEFAULT_RECOVERY_MAX = 5;
const DEFAULT_RECOVERY_WINDOW_MS = 900_000;
const CLEANUP_INTERVAL_MS = 120_000;
// DB 路径下，过期桶的惰性清理概率：每次限流检查约 1/200 顺手清一次过期行。
// 用概率而非定时器，因为 serverless 没有常驻进程跑定时清理。
const DB_CLEANUP_PROBABILITY = 1 / 200;

type Bucket = { count: number; resetAt: number };

// 进程内回退桶（无 DATABASE_URL 时用）。
const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();

function cleanupLocal(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

// 对给定 key 在 windowMs 窗口内允许 max 次请求；超出则返回需等待的秒数。
// 异步：DB 路径需查询；本地路径无 I/O 但仍返回 Promise 以统一签名。
export async function rateLimit(key: string, max: number, windowMs = DEFAULT_WINDOW_MS): Promise<RateLimitResult> {
  const sql = getOptionalSql();
  if (sql) {
    return rateLimitDb(sql, key, max, windowMs);
  }
  return rateLimitLocal(key, max, windowMs);
}

function rateLimitLocal(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanupLocal(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  existing.count += 1;
  if (existing.count > max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

// 原子 upsert：窗口过期则重置为 1，否则累加。returning 拿到累加后的 count 与
// reset_at，据此判定是否超限。ON CONFLICT 的行级锁保证同 key 并发安全。
async function rateLimitDb(
  sql: NonNullable<ReturnType<typeof getOptionalSql>>,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // 惰性清理过期桶，控制表体积（reset_at 上有索引）。
  if (Math.random() < DB_CLEANUP_PROBABILITY) {
    await sql`delete from rate_limit_buckets where reset_at < now()`.catch(() => {
      // 清理失败不影响限流判定。
    });
  }

  const rows = (await sql`
    insert into rate_limit_buckets (key, count, reset_at)
    values (${key}, 1, now() + ${windowMs} * interval '1 millisecond')
    on conflict (key) do update set
      count = case
        when rate_limit_buckets.reset_at <= now() then 1
        else rate_limit_buckets.count + 1
      end,
      reset_at = case
        when rate_limit_buckets.reset_at <= now() then now() + ${windowMs} * interval '1 millisecond'
        else rate_limit_buckets.reset_at
      end
    returning count, reset_at
  `) as Array<{ count: string | number; reset_at: string }>;

  const count = Number(rows[0]?.count ?? 0);
  if (count > max) {
    const resetAt = Date.parse(rows[0]?.reset_at ?? new Date().toISOString());
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

export type RateLimitConfig = {
  loginMax: number;
  registerMax: number;
  recoveryMax: number;
  windowMs: number;
  recoveryWindowMs: number;
};

// 限流参数：env 可覆盖默认值。
//   LOGIN_RATE_LIMIT_MAX / REGISTER_RATE_LIMIT_MAX：窗口内允许次数（>0 整数）。
//   RATE_LIMIT_WINDOW_MS：窗口毫秒（>0 整数）。
// 非法或缺失时回落默认值。接受 env 入参以便测试注入。
export function getRateLimitConfig(env: Record<string, string | undefined> = process.env): RateLimitConfig {
  const num = (value: string | undefined, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    loginMax: num(env.LOGIN_RATE_LIMIT_MAX, DEFAULT_LOGIN_MAX),
    registerMax: num(env.REGISTER_RATE_LIMIT_MAX, DEFAULT_REGISTER_MAX),
    recoveryMax: num(env.PASSWORD_RECOVERY_RATE_LIMIT_MAX, DEFAULT_RECOVERY_MAX),
    windowMs: num(env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    recoveryWindowMs: num(env.PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS, DEFAULT_RECOVERY_WINDOW_MS),
  };
}

// 取客户端真实 IP。Vercel / 反代后用 x-forwarded-for 首段。
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
