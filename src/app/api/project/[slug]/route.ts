import { NextRequest } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, parseProjectRubric as parseValidatedProjectRubric, reviewProjectEvidence } from "@/server/review/service";
import { courses, stageProjects, projectAttempts, reviewFeedbacks, learningRecords, repositorySubmissions, sandboxRuns } from "@/server/db/schema";
import { parseJson, parseJsonArray, parseStringArray } from "@/server/ai/json";
import { ok, fail } from "@/lib/api";
import { projectSandboxRunRecord } from "@/server/runner/record";
import { listPublicTestCases, listPublicTestRunRecords, projectTestCaseRecord } from "@/server/tests";
import { listPublicEvidenceFactRecords } from "@/server/scoring";
import type { ProjectDetail, ProjectRubricCriterion } from "@/types";

function parseProjectRubric(raw: string): ProjectRubricCriterion[] {
  return parseValidatedProjectRubric(raw) ?? [];
}

// GET /api/project/[slug]
// 返回阶段项目详情、结构化教学契约，以及当前用户最近 attempt 与对应 feedback。
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
      const rubricResults = parseJsonArray(fb.rubricResults);
      const acceptanceResults = parseJsonArray(fb.acceptanceResults);
      const hasStructured =
        (Array.isArray(rubricResults) && rubricResults.length > 0) ||
        (Array.isArray(acceptanceResults) && acceptanceResults.length > 0) ||
        Boolean(fb.capabilityNote);
      if (hasStructured) {
        // P2-05：返回持久化的证据化评分（rubric/acceptance/evidenceFacts/capabilityNote 均来自评分管线）。
        feedback = {
          provider: fb.provider,
          score: fb.score,
          summary: fb.summary,
          checklist: parseJsonArray(fb.checklist),
          suggestions: parseStringArray(fb.suggestions),
          rubricResults,
          acceptanceResults,
          capabilityNote: fb.capabilityNote || undefined,
          evidenceFacts: listPublicEvidenceFactRecords(latestAttempt.id),
          attempt: {
            id: latestAttempt.id,
            status: latestAttempt.status,
            submittedAt: latestAttempt.submittedAt,
          },
        };
      } else {
        // 旧数据回退：文本启发式（不声称执行过代码/测试）。
        const evidenceReview = reviewProjectEvidence(latestAttempt.code, {
          title: project.title,
          description: project.description,
          acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
          rubric: parseProjectRubric(project.rubric),
        });
        feedback = {
          provider: fb.provider,
          score: fb.score,
          summary: fb.summary,
          checklist: parseJsonArray(fb.checklist),
          suggestions: parseStringArray(fb.suggestions),
          rubricResults: evidenceReview.rubricResults,
          acceptanceResults: evidenceReview.acceptanceResults,
          capabilityNote: evidenceReview.capabilityNote,
          attempt: {
            id: latestAttempt.id,
            status: latestAttempt.status,
            submittedAt: latestAttempt.submittedAt,
          },
        };
      }
    }
  }

  let repository = null;
  if (latestAttempt) {
    const repoRow = appDb
      .select()
      .from(repositorySubmissions)
      .where(eq(repositorySubmissions.attemptId, latestAttempt.id))
      .orderBy(desc(repositorySubmissions.createdAt))
      .get();
    if (repoRow) {
      repository = {
        id: repoRow.id,
        sourceType: repoRow.sourceType,
        sourceUrl: repoRow.sourceUrl,
        archiveName: repoRow.archiveName,
        archiveKind: repoRow.archiveKind,
        status: repoRow.status,
        snapshot: parseJson(repoRow.snapshot, null),
        error: repoRow.error,
        submittedAt: repoRow.createdAt,
      };
    }
  }

  let sandboxRun = null;
  if (latestAttempt) {
    const runRow = appDb
      .select()
      .from(sandboxRuns)
      .where(and(eq(sandboxRuns.attemptId, latestAttempt.id), eq(sandboxRuns.kind, "main")))
      .orderBy(desc(sandboxRuns.createdAt))
      .get();
    if (runRow) sandboxRun = projectSandboxRunRecord(runRow);
  }

  // P2-04：公开测试定义与最近一次 attempt 的公开测试运行结果（隐藏测试绝不返回）。
  let publicTests: Array<{ id: string; name: string; framework: string }> = [];
  let publicTestRuns: ReturnType<typeof listPublicTestRunRecords> = [];
  if (project) {
    publicTests = listPublicTestCases(project.id).map(projectTestCaseRecord);
    if (latestAttempt) publicTestRuns = listPublicTestRunRecords(latestAttempt.id);
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

  const teachingContract = {
    guideMarkdown: project.guideMarkdown,
    deliverables: parseStringArray(project.deliverables),
    rubric: parseProjectRubric(project.rubric),
    reflectionQuestions: parseStringArray(project.reflectionQuestions),
  } satisfies Pick<ProjectDetail, "guideMarkdown" | "deliverables" | "rubric" | "reflectionQuestions">;

  return ok({
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    orderIndex: project.orderIndex,
    tasks: parseStringArray(project.tasks),
    acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
    ...teachingContract,
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
    latestRepository: repository,
    latestSandboxRun: sandboxRun,
    publicTests,
    publicTestRuns,
    feedback,
  });
}
