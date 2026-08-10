import { getSessionUser } from "@/server/auth/session";
import { getChoiceLabScenarioById } from "@/server/ai/scenarios";
import { ok, fail } from "@/lib/api";

// GET /api/choicelab/[id]
// 返回单个选型实验，字段与 ChoiceScenario 保持一致。
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim() || id.length > 200) return fail("场景标识无效", 400);

  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const scenario = getChoiceLabScenarioById(id);
  if (!scenario) return fail("场景不存在", 404);

  return ok({
    id: scenario.id,
    title: scenario.title,
    description: scenario.scenario,
    options: scenario.options,
  });
}
