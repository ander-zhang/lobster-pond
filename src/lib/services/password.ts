import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// scrypt 参数：N=2^15 是 Login 流程可接受的成本，远高于 bcrypt 默认。keylen=64 字节。
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const ALGORITHM_PREFIX = "scrypt";

// 哈希格式：`scrypt$<saltHex>$<hashHex>`。保留算法前缀便于未来迁移（如改用 argon2）。
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(plain, salt, SCRYPT_KEYLEN);
  return `${ALGORITHM_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// 校验密码。stored 格式非法 / 长度不符时返回 false，不抛错（避免向调用方泄露内部细节）。
// 用同 salt 重新 scrypt 后 timingSafeEqual 定长比较，防时序攻击。
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== ALGORITHM_PREFIX) {
    return false;
  }
  const salt = parts[1];
  const expectedHex = parts[2];
  let expected: Buffer;
  let saltBuf: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
    saltBuf = Buffer.from(salt, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) {
    return false;
  }

  let hash: Buffer;
  try {
    hash = await scrypt(plain, saltBuf, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  if (hash.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(hash, expected);
}
