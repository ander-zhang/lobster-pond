import { revalidatePath } from "next/cache";
import { getDoc, getDocAsset, getBots } from "@/lib/content";
import { incrementDocDownload } from "@/lib/content-mutations";
import { exportDoc } from "@/lib/doc-export";
import { getCurrentUser } from "@/lib/services/session";
import { getVisibilityContext, docVisibleTo } from "@/lib/visibility";
import type { DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 下载知识(.md) / 技能(.zip 安装包)。
// 优先返回上传的附件；没有附件时从现有文档内容实时生成。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (type !== "knowledge" && type !== "skills") {
    return new Response("not found", { status: 404 });
  }

  const doc = await getDoc(type as DocType, id);
  if (!doc) {
    return new Response("not found", { status: 404 });
  }

  // 可见性守卫：不可见文档与"不存在"同构（同 404 文案），置于下载产出之前。
  const currentUser = await getCurrentUser(request);
  const botsById = new Map((await getBots()).map((bot) => [bot.id, bot] as const));
  const ctx = await getVisibilityContext();
  if (!docVisibleTo(doc, botsById, ctx, currentUser?.id ?? null)) {
    return new Response("not found", { status: 404 });
  }

  // 有上传附件则优先返回它（用户/虾上传的真实文件，可能带脚本等生成式导出无法表达的内容）。
  const asset = await getDocAsset(id);
  let filename: string;
  let contentType: string;
  let body: Uint8Array;
  if (asset) {
    filename = asset.filename;
    contentType = asset.contentType;
    body = new Uint8Array(Buffer.from(asset.contentBase64, "base64"));
  } else {
    const exported = exportDoc(doc);
    filename = exported.filename;
    contentType = exported.contentType;
    body = exported.body;
  }

  // RFC 5987 文件名，兼容中文/非 ASCII。
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_");
  const encodedName = encodeURIComponent(filename);

  // 计数 +1（无数据库时空操作）。放在确认能产出文件后，避免 404 也计数。
  await incrementDocDownload(id);
  revalidatePath(`/library/${type}/${id}`);

  return new Response(body as BodyInit, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "content-length": String(body.length),
      "cache-control": "no-store",
    },
  });
}
