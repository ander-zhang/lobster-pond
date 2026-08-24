import { NextResponse } from "next/server";
import { createBot, updateBot } from "@/lib/services/bot-service";
import { deleteBot } from "@/lib/services/delete-service";
import { requireUser } from "@/lib/route-auth";
import { createBotCredential } from "@/lib/services/bot-credential-service";
import { getCurrentUser } from "@/lib/services/session";
import { getVisibleBots } from "@/lib/visible-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 可见性包装：隔离模式下只回「演示账号 + 自己的」虾（含 ownerUserId）；
  // 匿名只见演示虾。互通模式行为不变。
  const currentUser = await getCurrentUser(request);
  const bots = await getVisibleBots(currentUser);
  return NextResponse.json({ bots });
}

export async function POST(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  let result;
  try {
    result = await createBot(body, currentUser);
  } catch (err) {
    // createBot 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/bots] createBot failed:", err);
    return NextResponse.json(
      { ok: false, error: "创建失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  try {
    const credential = await createBotCredential(result.data, currentUser);
    return NextResponse.json(
      { ok: true, bot: result.data, credential: { id: credential.id, name: credential.name, token: credential.token } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/bots] createBotCredential failed:", err);
    return NextResponse.json(
      { ok: false, error: "虾已注册，但 Bot Token 创建失败，请稍后在凭据管理中重试。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "缺少 id 查询参数" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  let result;
  try {
    result = await updateBot(id, body, currentUser);
  } catch (err) {
    // updateBot 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[PATCH /api/bots] updateBot failed:", err);
    return NextResponse.json(
      { ok: false, error: "编辑失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, bot: result.data });
}

export async function DELETE(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "缺少 id 查询参数" }, { status: 400 });
  }

  let result;
  try {
    result = await deleteBot(id, currentUser);
  } catch (err) {
    // deleteBot 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/bots] deleteBot failed:", err);
    return NextResponse.json(
      { ok: false, error: "删除失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    // 403/401 来自授权；"not found" → 404；依赖拒绝 → 409 Conflict。
    const status = "status" in result ? result.status : result.error.includes("not found") ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}
