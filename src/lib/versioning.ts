// 文档版本约束（2026-08-13 spec）：纯 x.y.z 三段数字，无 v 前缀。
// 首版缺省 1.0.0；修订必填且数值逐段严格大于旧版本（发布者按更新大小选递增位）。
// 纯函数供 doc-service 与 schema 共用，单测在 tests/versioning.test.ts。
// 归一逻辑：空 → 1.0.0；已合法 x.y.z → 原样；v1.0.2 → 剥前缀 1.0.2；
// v1.0 / 1.0 → 补零 x.y.0；单段 / 无法解析 → 1.0.0。

// 合法格式：x.y.z，各段非负整数。无 v 前缀、不多不少正好三段。
export const DOC_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export type ParsedVersion = { major: number; minor: number; patch: number };

// 校验并解析版本号。非法格式返回 null。
export function parseDocVersion(value: string): ParsedVersion | null {
  if (!DOC_VERSION_RE.test(value)) return null;
  const [major, minor, patch] = value.split(".").map((segment) => Number(segment));
  return { major, minor, patch };
}

// 数值逐段比较：a > b 返回正数，a < b 返回负数，相等返回 0。
// 前置条件：a / b 均通过 parseDocVersion（合法 x.y.z）。
export function compareDocVersions(a: string, b: string): number {
  const pa = parseDocVersion(a)!;
  const pb = parseDocVersion(b)!;
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

// 历史版本归一为比较基线（仅修订时用于比较，不写库），恒返回合法 x.y.z。
export function normalizeLegacyVersion(value: string | null | undefined): string {
  if (!value) return "1.0.0";
  if (DOC_VERSION_RE.test(value)) return value;
  const stripped = value.startsWith("v") ? value.slice(1) : value;
  if (DOC_VERSION_RE.test(stripped)) return stripped;
  if (/^[0-9]+\.[0-9]+$/.test(stripped)) return `${stripped}.0`;
  return "1.0.0";
}

// 修订文档版本校验：必填 + 格式 + 严格递增。成功返回要写入的版本号。
export function validateVersionedUpdate(
  oldVersion: string | null | undefined,
  newVersion: string | null | undefined,
): { ok: true; version: string } | { ok: false; error: string } {
  if (!newVersion) {
    return { ok: false, error: "修订文档必须填写版本号（格式 x.y.z）" };
  }
  if (!DOC_VERSION_RE.test(newVersion)) {
    return { ok: false, error: "版本号格式必须为 x.y.z（如 1.0.0）" };
  }
  const baseline = normalizeLegacyVersion(oldVersion);
  if (compareDocVersions(newVersion, baseline) <= 0) {
    return { ok: false, error: `新版本号必须大于当前版本（当前为 ${baseline}）` };
  }
  return { ok: true, version: newVersion };
}
