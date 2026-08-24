import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/services/account-service";
import { buildClearedCookie } from "@/lib/services/session";
import { requireUser } from "@/lib/route-auth";
import { buildClearedRecoveryGrantCookie } from "@/lib/services/password-recovery";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  try {
    const deleted = await deleteAccount(currentUser.id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "账户不存在" }, { status: 404 });
    }
  } catch (error) {
    console.error("[DELETE /api/auth/account] deleteAccount failed:", error);
    return NextResponse.json({ ok: false, error: "注销失败，请稍后重试" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.append("set-cookie", buildClearedCookie());
  response.headers.append("set-cookie", buildClearedRecoveryGrantCookie());
  return response;
}
