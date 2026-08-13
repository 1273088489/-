import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import { completeRemediationPath } from "@/server/remediation";

export const dynamic = "force-dynamic";

// POST /api/remediation/[id]/complete
// 所有补课项按学习记录判定完成 → 标记路径 completed，
// 并更新项目 learning_record：mastery += 20（封顶 100），>=80 时 status=completed。
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const { id } = await ctx.params;
  if (!id?.trim() || id.length > 200) return fail("补课路径标识无效", 400);

  const result = completeRemediationPath(user.id, id);
  if (!result.ok) {
    if (result.code === "not-found") return fail("补课路径不存在", 404);
    return fail("还有补课项未完成", 409, { remaining: result.remaining ?? [] });
  }
  return ok(result.path);
}
