import { z } from "zod";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider, parseProjectRubric } from "@/server/review/service";
import { stageProjects, projectAttempts, reviewFeedbacks, learningRecords } from "@/server/db/schema";
import { describeAiProviderError } from "@/server/ai/errors";
import { parseJson, parseStringArray } from "@/server/ai/json";
import { buildProjectReviewInput, ReviewInputSchema } from "@/server/review/service";
import { ok, fail, parseBody } from "@/lib/api";

// POST /api/project/[slug]/submit
// 保存 project_attempt，调用 AI review，保存 review_feedback，并更新 learning_record。
const SubmitSchema = ReviewInputSchema;

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug?.trim() || slug.length > 200) return fail("项目标识无效", 400);
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const parsed = await parseBody(req, SubmitSchema);
  if ("error" in parsed) return parsed.error;
  const { code } = parsed.data;

  const project = appDb.select().from(stageProjects).where(eq(stageProjects.slug, slug)).get();
  if (!project) return fail("项目不存在", 404);
  const rubric = parseProjectRubric(project.rubric);
  if (!rubric) return fail("项目评分标准无效，暂不能提交", 500);

  const submittedAt = new Date().toISOString();
  const inserted = appDb
    .insert(projectAttempts)
    .values({
      userId: user.id,
      projectId: project.id,
      code,
      status: "submitted",
      submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    })
    .returning()
    .get();

  // 调用 AI 评审
  let review;
  try {
    const provider = getAiProvider();
    review = await provider.review(buildProjectReviewInput({
      code,
      title: project.title,
      description: project.description,
      acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
      rubric,
    }));
  } catch (error) {
    const failure = describeAiProviderError(error, "代码评审");
    return fail(failure.message, 502, { code: failure.code, attemptId: inserted.id });
  }

  const now = new Date().toISOString();
  appDb
    .insert(reviewFeedbacks)
    .values({
      attemptId: inserted.id,
      provider: review.provider,
      score: review.score,
      summary: review.summary,
      checklist: JSON.stringify(review.checklist),
      suggestions: JSON.stringify(review.suggestions),
      createdAt: now,
    })
    .run();

  appDb.update(projectAttempts).set({ status: "reviewed", updatedAt: now }).where(eq(projectAttempts.id, inserted.id)).run();

  // 根据评分决定学习记录状态：通过 / 需复审
  const recordStatus = "needs_review";
  const contentId = project.id;
  const legacyContentId = `${project.courseId}:${project.id}`;
  const existing = appDb
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, user.id),
        eq(learningRecords.contentId, contentId),
        eq(learningRecords.contentType, "project")
      )
    )
    .get() ?? appDb
      .select()
      .from(learningRecords)
      .where(
        and(
          eq(learningRecords.userId, user.id),
          eq(learningRecords.contentId, legacyContentId),
          eq(learningRecords.contentType, "project")
        )
      )
      .get();

  if (existing) {
    appDb
      .update(learningRecords)
      .set({ contentId, status: recordStatus, mastery: review.score, updatedAt: now })
      .where(eq(learningRecords.id, existing.id))
      .run();
  } else {
    appDb
      .insert(learningRecords)
      .values({
        userId: user.id,
        contentId,
        contentType: "project",
        status: recordStatus,
        mastery: review.score,
        errorHistory: "[]",
        updatedAt: now,
      })
      .run();
  }

  return ok({
    attempt: { id: inserted.id, status: "reviewed", submittedAt },
    review,
  });
}
