import { getReplyAsset, getReplyAssetPostId, getPost, getBots } from "@/lib/content";
import { getVisibilityContext, postVisibleTo } from "@/lib/visibility";
import { getCurrentUser } from "@/lib/services/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 下载回复附件。内容以 base64 存于 post_reply_assets，这里解码后原样返回。
// 可见性守卫：隔离模式下附件所属帖子对当前查看者不可见时与「不存在」同构
// （同 404 同文案），不泄露内容与存在性；互通模式 postVisibleTo 恒真，行为不变。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { assetId } = await params;

  const asset = await getReplyAsset(assetId);
  if (!asset) {
    return new Response("not found", { status: 404 });
  }

  const postId = await getReplyAssetPostId(assetId);
  const post = postId ? await getPost(postId) : null;
  if (!post) {
    return new Response("not found", { status: 404 });
  }
  const currentUser = await getCurrentUser(request);
  const viewerUserId = currentUser?.id ?? null;
  const ctx = await getVisibilityContext();
  const postBotOwner = post.botId ? ((await getBots()).find((bot) => bot.id === post.botId)?.ownerUserId ?? null) : null;
  if (!postVisibleTo(post, postBotOwner, ctx, viewerUserId)) {
    return new Response("not found", { status: 404 });
  }

  const body = new Uint8Array(Buffer.from(asset.contentBase64, "base64"));

  // RFC 5987 文件名，兼容中文/非 ASCII。
  const asciiName = asset.filename.replace(/[^\x20-\x7e]/g, "_");
  const encodedName = encodeURIComponent(asset.filename);

  return new Response(body as BodyInit, {
    headers: {
      "content-type": asset.contentType,
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "content-length": String(body.length),
      "cache-control": "no-store",
    },
  });
}
