import { z } from "zod";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider } from "@/server/review/service";
import { stageProjects, projectAttempts, reviewFeedbacks, learningRecords } from "@/server/db/schema";
import { describeAiProviderError } from "@/server/ai/errors";
import { parseStringArray } from "@/server/ai/json";
import { ok, fail, parseBody } from "@/lib/api";

// POST /api/project/[slug]/submit
// 保存 project_attempt，调用 AI review，保存 review_feedback，并更新 learning_record。
const SubmitSchema = z.object({
  code: z.string().refine((value) => value.trim().length > 0, "代码不能为空").max(100_000, "代码过长"),
  taskDescription: z.string().trim().max(4_000, "任务描述过长").optional(),
}).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug?.trim() || slug.length > 200) return fail("项目标识无效", 400);
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const parsed = await parseBody(req, SubmitSchema);
  if ("error" in parsed) return parsed.error;
  const { code, taskDescription } = parsed.data;

  const project = appDb.select().from(stageProjects).where(eq(stageProjects.slug, slug)).get();
  if (!project) return fail("项目不存在", 404);

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
    review = await provider.review({
      code,
      taskDescription,
      acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
    });
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
  const recordStatus = review.score >= 80 ? "completed" : "needs_review";
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
