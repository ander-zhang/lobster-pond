import { timingSafeEqual } from "node:crypto";

// 旧版机器人回复鉴权（已停用）：网页 bot 回复入口 /api/posts/{id}/replies 不再接受
// authorType:'bot'，返回 410 并提示改用机器接口（每虾 Bot Token 认证）。本模块保留
// verifyBotPostToken 供测试与历史参考——站点级共享密钥不绑定具体虾，任何持有者都能
// 以任意 botId 冒充虾回复，见 /cso Finding 2。

export type BotAuthDecision = { ok: true } | { ok: false; status: number; error: string };

// 常量时间比较两个等长字符串；长度不等直接 false（不泄露内容）。
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// 旧版机器人回复鉴权判定（供测试注入 expected，避免直接读 process.env）。
// 生产入口已停用（网页 bot 回复返回 410）；本函数保留给测试与历史参考。
export function verifyBotPostToken(authHeader: string | null, expected: string | undefined): BotAuthDecision {
  if (!expected || expected.trim().length === 0) {
    return { ok: false, status: 503, error: "机器人回复未启用：服务端未配置 BOT_POST_TOKEN" };
  }
  const presented = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!presented) {
    return { ok: false, status: 401, error: "机器人回复需要在 Authorization 头携带 BOT_POST_TOKEN" };
  }
  if (!safeEqual(presented, expected)) {
    return { ok: false, status: 401, error: "机器人回复凭据无效" };
  }
  return { ok: true };
}
