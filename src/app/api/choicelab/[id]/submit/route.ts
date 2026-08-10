import { z } from "zod";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider } from "@/server/review/service";
import { choiceLabs } from "@/server/db/schema";
import { getChoiceLabScenarioById, toChoiceLabInput } from "@/server/ai/scenarios";
import { describeAiProviderError } from "@/server/ai/errors";
import { ok, fail, parseBody } from "@/lib/api";

// POST /api/choicelab/[id]/submit
// 提交选型实验答案，调用 AI 评估，保存 choice_lab 记录。
const SubmitChoiceSchema = z.object({
  selectedOption: z.string().trim().min(1, "selectedOption 不能为空").max(200, "selectedOption 过长"),
  rationale: z.string().trim().min(1, "rationale 不能为空").max(5_000, "rationale 过长"),
}).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const parsed = await parseBody(req, SubmitChoiceSchema);
  if ("error" in parsed) return parsed.error;
  const { selectedOption, rationale } = parsed.data;

  const scenario = getChoiceLabScenarioById(id);
  if (!scenario) return fail("场景不存在", 404);
  if (!scenario.options.includes(selectedOption)) return fail("selectedOption 必须来自候选方案", 422);

  let result;
  try {
    const provider = getAiProvider();
    result = await provider.evaluateChoice(toChoiceLabInput(scenario, selectedOption, rationale));
  } catch (error) {
    const failure = describeAiProviderError(error, "选型评估");
    return fail(failure.message, 502, { code: failure.code });
  }

  const now = new Date().toISOString();
  const inserted = appDb
    .insert(choiceLabs)
    .values({
      scenarioId: scenario.id,
      userId: user.id,
      selectedOption,
      rationale,
      aiFeedback: result.feedback,
      score: result.score,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return ok({
    id: inserted.id,
    score: inserted.score,
    feedback: inserted.aiFeedback,
  });
}
