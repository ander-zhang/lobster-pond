import { NextResponse } from "next/server";
import { removeDocAsset, uploadDocAsset } from "@/lib/services/asset-service";
import { requireUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上传/覆盖文档附件。body: { filename, contentBase64 }（type、id 来自路径）。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  const { type, id } = await params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }

  let body: { filename?: unknown; contentBase64?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  let result;
  try {
    result = await uploadDocAsset({
      type,
      id,
      filename: body.filename,
      contentBase64: body.contentBase64,
    }, currentUser);
  } catch (err) {
    // uploadDocAsset 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/docs/[type]/[id]/asset] uploadDocAsset failed:", err);
    return NextResponse.json(
      { ok: false, error: "上传失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, asset: result.data }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  const { type, id } = await params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }
  let result;
  try {
    result = await removeDocAsset(type, id, currentUser);
  } catch (err) {
    // removeDocAsset 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/docs/[type]/[id]/asset] removeDocAsset failed:", err);
    return NextResponse.json(
      { ok: false, error: "删除失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}
