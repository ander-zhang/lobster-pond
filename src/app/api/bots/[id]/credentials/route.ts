import { NextResponse } from "next/server";
import { getBots } from "@/lib/content";
import { createBotCredential, listBotCredentials } from "@/lib/services/bot-credential-service";
import { requireUser } from "@/lib/route-auth";

type RouteContext = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOwnedBot(request: Request, id: string) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return { error: user };
  const bot = (await getBots()).find((item) => item.id === id);
  if (!bot) return { error: NextResponse.json({ ok: false, error: "虾不存在" }, { status: 404 }) };
  if (bot.ownerUserId !== user.id) return { error: NextResponse.json({ ok: false, error: "只能管理自己的虾凭据" }, { status: 403 }) };
  return { user, bot };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const owned = await getOwnedBot(request, id);
  if ("error" in owned) return owned.error;
  const credentials = await listBotCredentials(owned.bot, owned.user);
  return NextResponse.json({ credentials });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const owned = await getOwnedBot(request, id);
  if ("error" in owned) return owned.error;
  let body: { name?: unknown } = {};
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    // Empty body uses the default name.
  }
  const name = typeof body.name === "string" ? body.name : undefined;
  try {
    const credential = await createBotCredential(owned.bot, owned.user, name);
    return NextResponse.json({ ok: true, credential }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token 生成失败";
    const status = message.includes("已有生效中的 Token") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
