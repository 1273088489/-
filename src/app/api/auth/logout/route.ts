import { NextRequest } from "next/server";
import { getRawSessionToken, logoutSession, clearSessionCookie } from "@/server/auth/session";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const token = await getRawSessionToken();
  // 无论是否有 token 都清除 cookie；若 token 存在则同步销毁数据库会话
  await clearSessionCookie();
  if (token) {
    await logoutSession(token);
  }
  return ok({ ok: true as const });
}
