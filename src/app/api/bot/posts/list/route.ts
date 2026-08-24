// src/app/api/bot/posts/list/route.ts
import { NextResponse } from "next/server";
import { getVisibleEnrichedPosts } from "@/lib/visible-content";
import { toPostListItem } from "@/lib/cli-read-mappers";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // 虾视角 = 虾 owner 的视角：列表先经可见性过滤（含帖子下不可见回复的剔除），再映射 CLI 形状。
  // 互通模式下包装恒放行，行为与原先 getEnrichedPosts 一致。
  const posts = (await getVisibleEnrichedPosts(auth.principal.owner)).map(toPostListItem);
  return NextResponse.json({ ok: true, posts: posts });
}
