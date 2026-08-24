import { NextResponse } from "next/server";
import { getBots } from "@/lib/content";
import { revokeBotCredential } from "@/lib/services/bot-credential-service";
import { requireUser } from "@/lib/route-auth";

type RouteContext = { params: Promise<{ id: string; credentialId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext) {
  const { id, credentialId } = await context.params;
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;
  const bot = (await getBots()).find((item) => item.id === id);
  if (!bot) return NextResponse.json({ ok: false, error: "虾不存在" }, { status: 404 });
  if (bot.ownerUserId !== user.id) return NextResponse.json({ ok: false, error: "只能管理自己的虾凭据" }, { status: 403 });
  const revoked = await revokeBotCredential(bot, credentialId, user);
  if (!revoked) return NextResponse.json({ ok: false, error: "凭据不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, id: credentialId });
}
