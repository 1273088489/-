import { z } from "zod";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider, parseProjectRubric } from "@/server/review/service";
import { stageProjects, projectAttempts, reviewFeedbacks } from "@/server/db/schema";
import { describeAiProviderError } from "@/server/ai/errors";
import { parseJson, parseJsonArray, parseStringArray } from "@/server/ai/json";
import { buildProjectReviewInput } from "@/server/review/service";
import { ok, fail, parseBody } from "@/lib/api";

// POST /api/ai/review
// 重跑指定 attempt 的 AI 评审，并把结果存库后返回。
const ReviewSchema = z.object({
  attemptId: z.string().trim().min(1, "attemptId 不能为空").max(200, "attemptId 过长"),
}).strict();

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const parsed = await parseBody(req, ReviewSchema);
  if ("error" in parsed) return parsed.error;
  const { attemptId } = parsed.data;

  const attempt = appDb.select().from(projectAttempts).where(eq(projectAttempts.id, attemptId)).get();
  if (!attempt) return fail("提交记录不存在", 404);
  if (attempt.userId !== user.id) return fail("无权操作该提交记录", 403);

  const project = appDb.select().from(stageProjects).where(eq(stageProjects.id, attempt.projectId)).get();
  if (!project) return fail("项目不存在", 404);
  const rubric = parseProjectRubric(project.rubric);
  if (!rubric) return fail("项目评分标准无效，暂不能评审", 500);

  let review;
  try {
    const provider = getAiProvider();
    review = await provider.review(buildProjectReviewInput({
      code: attempt.code,
      title: project.title,
      description: project.description,
      acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
      rubric,
    }));
  } catch (error) {
    const failure = describeAiProviderError(error, "代码评审");
    return fail(failure.message, 502, { code: failure.code, attemptId: attempt.id });
  }

  const now = new Date().toISOString();
  const inserted = appDb
    .insert(reviewFeedbacks)
    .values({
      attemptId: attempt.id,
      provider: review.provider,
      score: review.score,
      summary: review.summary,
      checklist: JSON.stringify(review.checklist),
      suggestions: JSON.stringify(review.suggestions),
      createdAt: now,
    })
    .returning()
    .get();

  appDb.update(projectAttempts).set({ status: "reviewed", updatedAt: now }).where(eq(projectAttempts.id, attempt.id)).run();

  const persistedReview = {
    provider: inserted.provider,
    score: inserted.score,
    summary: inserted.summary,
    checklist: parseJsonArray<(typeof review.checklist)[number]>(inserted.checklist),
    suggestions: parseStringArray(inserted.suggestions),
  };

  return ok({
    attempt: { id: attempt.id, status: "reviewed", submittedAt: attempt.submittedAt },
    review: persistedReview,
  });
}
