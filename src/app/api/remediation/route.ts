import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import { getOrCreateRemediationPath, listUserRemediationPaths, listUserRemediationPathsForProject } from "@/server/remediation";

export const dynamic = "force-dynamic";

// GET /api/remediation?projectSlug=<slug>
// - 不带 projectSlug：返回当前用户全部补课路径（实时完成状态）。
// - 带 projectSlug：返回该项目的补课路径；若最近一次评审失败且尚无路径，
//   服务端按 errorHistory + 测试失败分类 + rubric 低分维度懒生成（幂等）。
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const projectSlug = req.nextUrl.searchParams.get("projectSlug")?.trim() ?? "";
  if (projectSlug) {
    if (projectSlug.length > 200) return fail("项目标识无效", 400);
    const result = await getOrCreateRemediationPath(user.id, projectSlug);
    if (!result.ok) return fail("项目不存在", 404);
    return ok(result.path ? [result.path] : []);
  }

  return ok(listUserRemediationPaths(user.id));
}
