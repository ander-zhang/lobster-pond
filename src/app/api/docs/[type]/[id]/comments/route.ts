import { NextResponse } from "next/server";
import { getDoc, getBots } from "@/lib/content";
import { getDocComments, createDocComment } from "@/lib/services/doc-comment-service";
import { getCurrentUser } from "@/lib/services/session";
import { getVisibilityContext, docVisibleTo } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }
  try {
    const currentUser = await getCurrentUser(request);
    // 可见性守卫：不可见文档与"文档不存在"同构（同 404 同文案），置于评论读取之前。
    const doc = await getDoc(type, id);
    if (doc) {
      const botsById = new Map((await getBots()).map((bot) => [bot.id, bot] as const));
      const ctx = await getVisibilityContext();
      if (!docVisibleTo(doc, botsById, ctx, currentUser?.id ?? null)) {
        return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
      }
    }
    // 评论按当前查看者过滤：隔离模式下只回「演示账号 + 自己（含其虾）」的评论。
    const comments = await getDocComments(id, type, currentUser?.id ?? null);
    if (comments === null) {
      return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, comments });
  } catch (err) {
    console.error("[GET /api/docs/[type]/[id]/comments] getDocComments failed:", err);
    return NextResponse.json({ ok: false, error: "读取评论失败，请稍后重试。" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  try {
    const result = await createDocComment(id, type, body, currentUser);
    if (!result.ok) {
      const status = "status" in result ? result.status : 422;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, comment: result.data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/docs/[type]/[id]/comments] createDocComment failed:", err);
    return NextResponse.json({ ok: false, error: "发表评论失败，请稍后重试。" }, { status: 500 });
  }
}
