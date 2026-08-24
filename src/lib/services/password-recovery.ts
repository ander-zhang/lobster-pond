import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_GRANT_COOKIE = "password_recovery_grant";
export const RECOVERY_GRANT_TTL_SECONDS = 300;

type RecoveryGrant = {
  userId: string;
  sessionHash: string;
  expiresAt: number;
  nonce: string;
};

function configuredSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.PASSWORD_RECOVERY_KEY?.trim();
  return secret && Buffer.byteLength(secret, "utf8") >= 32 ? secret : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyRecoveryKey(input: string, env: Record<string, string | undefined> = process.env): "valid" | "invalid" | "unconfigured" {
  const secret = configuredSecret(env);
  if (!secret) return "unconfigured";
  return safeEqual(input, secret) ? "valid" : "invalid";
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function hashSession(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`session:${sessionId}`).digest("base64url");
}

export function createRecoveryGrant(
  userId: string,
  sessionId: string,
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): string | null {
  const secret = configuredSecret(env);
  if (!secret) return null;
  const grant: RecoveryGrant = {
    userId,
    sessionHash: hashSession(sessionId, secret),
    expiresAt: now + RECOVERY_GRANT_TTL_SECONDS * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyRecoveryGrant(
  token: string,
  userId: string,
  sessionId: string,
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): boolean {
  const secret = configuredSecret(env);
  if (!secret) return false;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0 || !safeEqual(signature, sign(payload, secret))) return false;

  try {
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RecoveryGrant>;
    return grant.userId === userId
      && grant.sessionHash === hashSession(sessionId, secret)
      && typeof grant.expiresAt === "number"
      && grant.expiresAt >= now
      && typeof grant.nonce === "string";
  } catch {
    return false;
  }
}

function secureAttribute(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function buildRecoveryGrantCookie(token: string): string {
  return `${RECOVERY_GRANT_COOKIE}=${token}; HttpOnly; Path=/api/auth/password/recovery; SameSite=Strict; Max-Age=${RECOVERY_GRANT_TTL_SECONDS}${secureAttribute()}`;
}

export function buildClearedRecoveryGrantCookie(): string {
  return `${RECOVERY_GRANT_COOKIE}=; HttpOnly; Path=/api/auth/password/recovery; SameSite=Strict; Max-Age=0${secureAttribute()}`;
}

export function readRecoveryGrant(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === RECOVERY_GRANT_COOKIE) return value.join("=") || null;
  }
  return null;
}
