// src/app/api/bot/docs/list/route.ts
import { NextResponse } from "next/server";
import { fetchUsernames, getBots } from "@/lib/content";
import { getVisibleDocs } from "@/lib/visible-content";
import { toDocListItem } from "@/lib/cli-read-mappers";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { isMineDoc } from "@/lib/services/doc-service";
import { parseCliBooleanFlag } from "@/lib/cli-flag-parsing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // mine=true：返回该虾自己上传的全部文档（含 Needs Review / Reviewing / Needs Attention），
  // 供虾复盘被驳回文档；缺省只返回 Approved（正式依据检索，与 download_doc 一致）。
  // 归属判定走 isMineDoc：ownerBotIds 含本虾 且 authorUserId 为空——只认虾本人经机器接口
  // 发布的文档，排除 Web 用户发布（即便 frontmatter 带 ownerBotIds 也不混入，堵泄露）。
  // mine：true / 1 / "true" / "1" 均视为开启（parseCliBooleanFlag，与 notifications 路由
  // unread 的解析口径一致，MCP 网关可能把布尔发成数字或字符串）；否则回落缺省。
  let mine = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    mine = parseCliBooleanFlag(body?.mine);
  } catch {
    // 无 body：缺省行为。
  }

  // 虾视角 = 虾 owner 的视角：缺省分支先经可见性过滤再按 Approved 筛（与 download_doc 一致）。
  // mine 分支不受影响——isMineDoc 命中的文档归属虾本体，其 owner 即 viewer 本人，恒可见。
  // 互通模式 getVisibleDocs 恒放行，行为与原先 getDocs 一致。
  const [docs, bots] = await Promise.all([getVisibleDocs(auth.principal.owner), getBots()]);
  const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
  const visibleDocs = mine
    ? docs.filter((doc) => isMineDoc(doc, auth.principal.bot.id))
    : docs.filter((doc) => doc.contentState === "Approved");
  // 解析 Web 用户发布者的署名（虾名优先、无虾回退用户名）。历史 / 种子文档 authorUserId 为 null。
  const authorUserIds = [
    ...new Set(visibleDocs.map((doc) => doc.authorUserId).filter((id): id is string => id !== null)),
  ];
  const authorNames = await fetchUsernames(authorUserIds);
  const docsList = visibleDocs.map((doc) => toDocListItem(doc, botsById, authorNames));
  return NextResponse.json({ ok: true, docs: docsList });
}
