import { getSessionUser } from "@/server/auth/session";
import { choiceLabScenarios } from "@/server/ai/scenarios";
import { ok, fail } from "@/lib/api";

// GET /api/choicelab
// 返回选型实验场景列表（至少 5 个，覆盖不同维度的技术选型）。
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  return ok({
    scenarios: choiceLabScenarios.map(({ id, title, scenario, options }) => ({
      id,
      title,
      description: scenario,
      options,
    })),
  });
}
