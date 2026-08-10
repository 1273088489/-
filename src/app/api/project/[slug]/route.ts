import { NextRequest } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb } from "@/server/review/service";
import { courses, stageProjects, projectAttempts, reviewFeedbacks, learningRecords } from "@/server/db/schema";
import { parseJsonArray, parseStringArray } from "@/server/ai/json";
import { ok, fail } from "@/lib/api";

// GET /api/project/[slug]
// 返回阶段项目详情：tasks、acceptanceCriteria、当前用户最近 attempt 与对应 feedback。
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug?.trim() || slug.length > 200) return fail("项目标识无效", 400);
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const project = appDb.select().from(stageProjects).where(eq(stageProjects.slug, slug)).get();
  if (!project) return fail("项目不存在", 404);
  const course = appDb.select().from(courses).where(eq(courses.id, project.courseId)).get();

  const latestAttempt = appDb
    .select()
    .from(projectAttempts)
    .where(and(eq(projectAttempts.projectId, project.id), eq(projectAttempts.userId, user.id)))
    .orderBy(desc(projectAttempts.submittedAt))
    .get();

  let feedback = null;
  if (latestAttempt) {
    const fb = appDb
      .select()
      .from(reviewFeedbacks)
      .where(eq(reviewFeedbacks.attemptId, latestAttempt.id))
      .orderBy(desc(reviewFeedbacks.createdAt))
      .get();
    if (fb) {
      feedback = {
        provider: fb.provider,
        score: fb.score,
        summary: fb.summary,
        checklist: parseJsonArray(fb.checklist),
        suggestions: parseStringArray(fb.suggestions),
        attempt: {
          id: latestAttempt.id,
          status: latestAttempt.status,
          submittedAt: latestAttempt.submittedAt,
        },
      };
    }
  }

  const contentId = project.id;
  const legacyContentId = `${project.courseId}:${project.id}`;
  const learning = appDb
    .select()
    .from(learningRecords)
    .where(and(eq(learningRecords.userId, user.id), eq(learningRecords.contentId, contentId), eq(learningRecords.contentType, "project")))
    .get() ?? appDb
    .select()
    .from(learningRecords)
    .where(and(eq(learningRecords.userId, user.id), eq(learningRecords.contentId, legacyContentId), eq(learningRecords.contentType, "project")))
    .get();

  return ok({
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    orderIndex: project.orderIndex,
    tasks: parseStringArray(project.tasks),
    acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
    courseSlug: course?.slug ?? "",
    courseTitle: course?.title ?? "",
    status: learning?.status ?? "not_started",
    mastery: learning?.mastery ?? 0,
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          code: latestAttempt.code,
          status: latestAttempt.status,
          submittedAt: latestAttempt.submittedAt,
        }
      : null,
    feedback,
  });
}
