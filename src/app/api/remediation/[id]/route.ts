import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import { getRemediationPathRecord } from "@/server/remediation";

export const dynamic = "force-dynamic";

// GET /api/remediation/[id] —— 单条补课路径（实时完成状态）。
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const { id } = await ctx.params;
  if (!id?.trim() || id.length > 200) return fail("补课路径标识无效", 400);

  const path = getRemediationPathRecord(user.id, id);
  if (!path) return fail("补课路径不存在", 404);
  return ok(path);
}
