import { z } from "zod";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getAiProvider } from "@/server/review/service";
import { describeAiProviderError } from "@/server/ai/errors";
import { ok, fail, parseBody } from "@/lib/api";

// POST /api/ai/coach
// 分级学习教练：level 1-3 为提示，4 为参考答案。
const CoachSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(4_000, "问题过长"),
  level: z.number().int().min(1).max(4, "level 需在 1-4 之间"),
  context: z.string().trim().max(20_000, "上下文过长").optional(),
}).strict();

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const parsed = await parseBody(req, CoachSchema);
  if ("error" in parsed) return parsed.error;
  const { question, level, context } = parsed.data;

  try {
    const provider = getAiProvider();
    const result = await provider.coach({ question, level, context });

    return ok({ response: result.text, level: result.level, mode: result.mode });
  } catch (error) {
    const failure = describeAiProviderError(error, "教练");
    return fail(failure.message, 502, { code: failure.code });
  }
}
