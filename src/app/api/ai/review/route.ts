import { z } from "zod";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider, parseProjectRubric } from "@/server/review/service";
import { stageProjects, projectAttempts, reviewFeedbacks, repositorySubmissions, sandboxRuns, testCases, testRuns } from "@/server/db/schema";
import { describeAiProviderError } from "@/server/ai/errors";
import { parseJson, parseJsonArray, parseStringArray } from "@/server/ai/json";
import { buildProjectReviewInput } from "@/server/review/service";
import { runEvidenceScoring, listPublicEvidenceFactRecords } from "@/server/scoring";
import { ok, fail, parseBody } from "@/lib/api";
import type { RepoSnapshot } from "@/server/repo";
import type { ReviewResult as AiReviewResult } from "@/server/ai";
import type { ReviewResult } from "@/types";

// POST /api/ai/review
// 重跑指定 attempt 的 AI 评审，并把结果存库后返回。
// 仓库提交（P2-05）：基于持久化的 RepoSnapshot + test_run（公开+隐藏）+ 主沙箱运行证据评分；
// 文本/代码提交：保持原有形成性评审行为。
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

  const projectContext = {
    title: project.title,
    description: project.description,
    acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
    rubric,
  };

  let review: AiReviewResult;
  try {
    const repoRow = appDb
      .select()
      .from(repositorySubmissions)
      .where(eq(repositorySubmissions.attemptId, attempt.id))
      .orderBy(repositorySubmissions.createdAt)
      .get();
    const mainRun = appDb
      .select()
      .from(sandboxRuns)
      .where(and(eq(sandboxRuns.attemptId, attempt.id), eq(sandboxRuns.kind, "main")))
      .get();
    const snapshot = repoRow ? parseJson<RepoSnapshot | null>(repoRow.snapshot, null) : null;

    if (repoRow && repoRow.status === "parsed" && snapshot) {
      const allTestRuns = appDb
        .select({ run: testRuns, testCase: testCases })
        .from(testRuns)
        .innerJoin(testCases, eq(testRuns.testCaseId, testCases.id))
        .where(eq(testRuns.attemptId, attempt.id))
        .all();
      const scored = await runEvidenceScoring({
        project: projectContext,
        snapshot,
        testRuns: allTestRuns,
        mainRun: mainRun ?? null,
        attemptId: attempt.id,
        skipFileContent: true,
      });
      review = {
        provider: scored.review.provider,
        score: scored.review.score,
        summary: scored.review.summary,
        checklist: scored.review.checklist,
        suggestions: scored.review.suggestions,
        rubricResults: scored.review.rubricResults,
        acceptanceResults: scored.review.acceptanceResults,
        capabilityNote: scored.review.capabilityNote,
        evidenceFacts: listPublicEvidenceFactRecords(attempt.id),
      };
    } else {
      const provider = getAiProvider();
      review = await provider.review(buildProjectReviewInput({ code: attempt.code, ...projectContext }));
    }
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
      rubricResults: JSON.stringify(review.rubricResults ?? []),
      acceptanceResults: JSON.stringify(review.acceptanceResults ?? []),
      evidenceFacts: JSON.stringify(review.evidenceFacts ?? []),
      capabilityNote: review.capabilityNote ?? "",
      createdAt: now,
    })
    .returning()
    .get();

  appDb.update(projectAttempts).set({ status: "reviewed", updatedAt: now }).where(eq(projectAttempts.id, attempt.id)).run();

  const persistedReview: ReviewResult = {
    provider: inserted.provider,
    score: inserted.score,
    summary: inserted.summary,
    checklist: parseJsonArray(inserted.checklist),
    suggestions: parseStringArray(inserted.suggestions),
    ...(inserted.rubricResults ? { rubricResults: parseJsonArray(inserted.rubricResults) } : {}),
    ...(inserted.acceptanceResults ? { acceptanceResults: parseJsonArray(inserted.acceptanceResults) } : {}),
    ...(inserted.capabilityNote ? { capabilityNote: inserted.capabilityNote } : {}),
    ...(inserted.evidenceFacts ? { evidenceFacts: listPublicEvidenceFactRecords(attempt.id) } : {}),
  };

  return ok({
    attempt: { id: attempt.id, status: "reviewed", submittedAt: attempt.submittedAt },
    review: persistedReview,
  });
}
