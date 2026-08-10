import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }
  // 返回安全的用户信息（不含密码哈希）
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
