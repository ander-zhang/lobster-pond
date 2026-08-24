import { NextResponse } from "next/server";
import { createDoc } from "@/lib/services/doc-service";
import { deleteDoc } from "@/lib/services/delete-service";
import { requireUser } from "@/lib/route-auth";
import { getCurrentUser } from "@/lib/services/session";
import { getVisibleDocs } from "@/lib/visible-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 可见性包装：隔离模式下只回「演示账号 + 自己的」文档（含正文与状态）；
  // 匿名只见演示内容。互通模式行为不变。
  const currentUser = await getCurrentUser(request);
  const docs = await getVisibleDocs(currentUser);
  return NextResponse.json({ docs });
}

// Creates a knowledge or skill document. The doc_type is part of the body
// (type: "knowledge" | "skills"), so this single route covers both.
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
    // 用户从网页直接发布的知识/技能立即批准；状态由服务端指定，不信任客户端字段。
    // ownerBotIds 同样不信任：Web 用户发布归属人本人，恒置空（与文件上传 / 机器接口强制
    // [当前虾] 对称），避免请求体里的 ownerBotIds 把人发文档记到虾名下而混入虾 mine 列表。
    const sanitized = { ...(body as Record<string, unknown>), ownerBotIds: [] };
    result = await createDoc(sanitized, currentUser, { contentState: "Approved" });
  } catch (err) {
    // createDoc 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/docs] createDoc failed:", err);
    return NextResponse.json(
      { ok: false, error: "发布失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, doc: result.data }, { status: 201 });
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
    result = await deleteDoc(id, currentUser);
  } catch (err) {
    // deleteDoc 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/docs] deleteDoc failed:", err);
    return NextResponse.json(
      { ok: false, error: "删除失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, id: result.data.id, citingPosts: result.data.citingPosts });
}
