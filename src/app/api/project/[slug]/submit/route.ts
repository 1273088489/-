import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { appDb, getAiProvider, parseProjectRubric } from "@/server/review/service";
import { stageProjects, projectAttempts, reviewFeedbacks, learningRecords, repositorySubmissions, sandboxRuns, testCases, testRuns } from "@/server/db/schema";
import { describeAiProviderError } from "@/server/ai/errors";
import { parseJson, parseStringArray } from "@/server/ai/json";
import { buildProjectReviewInput, ReviewInputSchema } from "@/server/review/service";
import { ok, fail } from "@/lib/api";
import { ingestRepository, isRepoError, validateRepoUrl, detectArchiveKind, REPO_LIMITS } from "@/server/repo";
import type { RepoSnapshot } from "@/server/repo";
import type { IngestSource } from "@/server/repo/ingest";
import { runProjectInSandbox, resolveProjectSandboxConfig } from "@/server/runner";
import { materializeRepository } from "@/server/runner/materialize";
import { projectSandboxRunRecord } from "@/server/runner/record";
import type { SandboxProjectRunResult } from "@/server/runner";
import type { ReviewResult, SandboxRunRecord, TestCaseRecord, TestRunRecord } from "@/types";
import { runEvidenceScoring, listPublicEvidenceFactRecords } from "@/server/scoring";
import {
  executeProjectTests,
  listProjectTestCases,
  listPublicTestCases,
  listPublicTestRunRecords,
  projectTestCaseRecord,
} from "@/server/tests";

// POST /api/project/[slug]/submit
// 1) JSON `{ code }`：原有文本/代码提交 → 保存 attempt + AI review（行为不变）。
// 2) JSON `{ repoUrl }`：接收 Git 仓库（仅 https）→ 隔离临时目录克隆/解析 → 保存 repository_submission。
// 3) multipart/form-data `archive`（.zip / .tar.gz）：上传解包解析 → 保存 repository_submission。
// 仓库提交（P2-02 解析）后，P2-03 在受限沙箱中按项目 sandbox 配置执行 install/build/test，
// 结果持久化到 sandbox_run；沙箱不可用时明确报错，绝不回退到宿主执行、绝不伪造成功。

const RepoUrlSchema = z.object({
  repoUrl: z.string().trim().min(1, "仓库地址不能为空").max(2000, "仓库地址过长"),
}).strict();

const MAX_ARCHIVE_BYTES = REPO_LIMITS.maxArchiveBytes;

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug?.trim() || slug.length > 200) return fail("项目标识无效", 400);
  const user = await getSessionUser();
  if (!user) return fail("未登录", 401);

  const project = appDb.select().from(stageProjects).where(eq(stageProjects.slug, slug)).get();
  if (!project) return fail("项目不存在", 404);

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return handleArchiveSubmit(req, user.id, project);
  }
  return handleJsonSubmit(req, user.id, project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function handleJsonSubmit(req: NextRequest, userId: string, project: typeof stageProjects.$inferSelect) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }

  if (isRecord(raw) && typeof raw.repoUrl === "string") {
    const parsed = RepoUrlSchema.safeParse({ repoUrl: raw.repoUrl });
    if (!parsed.success) return fail("参数校验失败", 422, { issues: parsed.error.issues });
    const check = validateRepoUrl(parsed.data.repoUrl);
    if (!check.ok) return fail(check.reason, 422, { code: "invalid-url" });
    return submitRepository(
      { type: "url", url: check.url },
      userId,
      project,
      { sourceUrl: check.url },
    );
  }

  const parsed = ReviewInputSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, { issues: parsed.error.issues });
  return handleCodeSubmit(parsed.data.code, userId, project.id);
}

async function handleArchiveSubmit(req: NextRequest, userId: string, project: typeof stageProjects.$inferSelect) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("请求体不是合法的 multipart 表单", 400);
  }
  const file = formData.get("archive");
  if (!(file instanceof File)) return fail("缺少 archive 文件字段", 400);
  if (file.size === 0) return fail("上传文件为空", 400);
  if (file.size > MAX_ARCHIVE_BYTES) return fail("压缩包超过大小限制（50MB）", 413, { code: "archive-too-large" });
  const archiveName = file.name || "archive";
  if (!detectArchiveKind(archiveName)) return fail("仅支持 .zip / .tar.gz 压缩包", 422, { code: "invalid-archive" });

  // 保存到临时目录后交给 ingest（ingest 会在自己的临时目录解包并在 finally 清理）；
  // 沙箱执行会复用同一压缩包再次物化，因此 uploadDir 在 submitRepository 完成前不清理。
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-upload-"));
  const filePath = path.join(uploadDir, `upload${path.extname(archiveName).toLowerCase()}`);
  try {
    await fs.promises.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    return await submitRepository(
      { type: "archive", filePath, archiveName },
      userId,
      project,
      { archiveName },
    );
  } finally {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

/** 沙箱执行 + 持久化 sandbox_run；物化失败也落一条失败记录并返回投影。 */
async function executeSandboxRun(input: {
  source: IngestSource;
  project: typeof stageProjects.$inferSelect;
  attemptId: string;
  repositorySubmissionId: string;
  config: ReturnType<typeof resolveProjectSandboxConfig>;
}): Promise<SandboxRunRecord> {
  const { config } = input;
  const startedAt = new Date().toISOString();

  let materialized;
  try {
    materialized = await materializeRepository(input.source);
  } catch (error) {
    const message = isRepoError(error) ? error.message : "沙箱执行准备失败：无法重新获取仓库快照。";
    const row = appDb
      .insert(sandboxRuns)
      .values({
        kind: "main",
        attemptId: input.attemptId,
        repositorySubmissionId: input.repositorySubmissionId,
        runtime: config.runtime ?? "node",
        status: "failed",
        errorCode: "",
        exitCode: null,
        stdout: "",
        stderr: "",
        phases: "[]",
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        timedOut: false,
        oomKilled: false,
        message,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      .returning()
      .get();
    return projectSandboxRunRecord(row);
  }

  try {
    const outcome: SandboxProjectRunResult = await runProjectInSandbox({
      projectDir: materialized.projectDir,
      config,
    });
    const finishedAt = new Date().toISOString();
    const row = appDb
      .insert(sandboxRuns)
      .values({
        kind: "main",
        attemptId: input.attemptId,
        repositorySubmissionId: input.repositorySubmissionId,
        runtime: outcome.runtime,
        status: outcome.status === "success" ? "success" : "failed",
        errorCode: outcome.status === "success" ? "" : outcome.status,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        phases: JSON.stringify(outcome.phases),
        startedAt,
        finishedAt,
        durationMs: outcome.durationMs,
        timedOut: outcome.timedOut,
        oomKilled: outcome.oomKilled,
        message: outcome.message ?? "",
        createdAt: startedAt,
        updatedAt: finishedAt,
      })
      .returning()
      .get();
    return projectSandboxRunRecord(row);
  } finally {
    materialized.cleanup();
  }
}

async function submitRepository(
  source: IngestSource,
  userId: string,
  project: typeof stageProjects.$inferSelect,
  meta: { sourceUrl?: string; archiveName?: string },
) {
  const submittedAt = new Date().toISOString();
  const attempt = appDb
    .insert(projectAttempts)
    .values({
      userId,
      projectId: project.id,
      code: "",
      status: "submitted",
      submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    })
    .returning()
    .get();

  let snapshot: RepoSnapshot;
  try {
    snapshot = await ingestRepository(source);
  } catch (error) {
    const code = isRepoError(error) ? error.code : "io-error";
    const message = isRepoError(error) ? error.message : "仓库接收失败，请稍后重试。";
    appDb
      .insert(repositorySubmissions)
      .values({
        attemptId: attempt.id,
        sourceType: source.type,
        sourceUrl: meta.sourceUrl ?? "",
        archiveName: meta.archiveName ?? "",
        archiveKind: source.type === "archive" ? (detectArchiveKind(source.archiveName) ?? "") : "",
        status: "failed",
        snapshot: "{}",
        error: message,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      })
      .run();
    return fail(message, 400, { code, attemptId: attempt.id });
  }

  const now = new Date().toISOString();
  const repositoryRow = appDb
    .insert(repositorySubmissions)
    .values({
      attemptId: attempt.id,
      sourceType: source.type,
      sourceUrl: meta.sourceUrl ?? "",
      archiveName: meta.archiveName ?? "",
      archiveKind: source.type === "archive" ? (detectArchiveKind(source.archiveName) ?? "") : "",
      status: "parsed",
      snapshot: JSON.stringify(snapshot),
      error: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const baseConfig = resolveProjectSandboxConfig(parseJson(project.sandboxConfig, {}));

  // P2-03：仓库解析成功后，在受限沙箱中执行项目（同步 v1，超时由沙箱保护）。
  const sandboxRun = await executeSandboxRun({
    source,
    project,
    attemptId: attempt.id,
    repositorySubmissionId: repositoryRow.id,
    config: baseConfig,
  });

  // P2-04：公开测试（学习者可见）+ 隐藏测试（服务端专用）在受限沙箱中执行并持久化。
  const publicTestCases = listPublicTestCases(project.id);
  if (publicTestCases.length > 0) {
    await executeProjectTests({
      source,
      projectId: project.id,
      attemptId: attempt.id,
      repositorySubmissionId: repositoryRow.id,
      kind: "public",
      baseConfig,
    });
  }
  if (listProjectTestCases(project.id, "hidden").length > 0) {
    await executeProjectTests({
      source,
      projectId: project.id,
      attemptId: attempt.id,
      repositorySubmissionId: repositoryRow.id,
      kind: "hidden",
      baseConfig,
    });
  }
  const publicTestRuns: TestRunRecord[] = listPublicTestRunRecords(attempt.id);
  const publicTests: TestCaseRecord[] = publicTestCases.map(projectTestCaseRecord);

  if (sandboxRun.status === "failed" && sandboxRun.errorCode === "infra-unavailable") {
    // 沙箱不可用：不执行评分、不伪造证据（P2-01 不变量）。
    return fail(sandboxRun.message || "沙箱不可用：Docker 未安装或守护进程不可达。", 502, {
      code: "sandbox-infra-unavailable",
      attemptId: attempt.id,
      repository: snapshot,
      sandboxRun,
    });
  }

  // P2-05：证据化 AI 评分 —— 综合 RepoSnapshot + test_runs（公开+隐藏）+ rubric + 需求。
  const allTestRuns = appDb
    .select({ run: testRuns, testCase: testCases })
    .from(testRuns)
    .innerJoin(testCases, eq(testRuns.testCaseId, testCases.id))
    .where(eq(testRuns.attemptId, attempt.id))
    .all();
  const mainRunRow = appDb
    .select()
    .from(sandboxRuns)
    .where(and(eq(sandboxRuns.attemptId, attempt.id), eq(sandboxRuns.kind, "main")))
    .get() ?? null;

  const scoringRubric = parseProjectRubric(project.rubric);
  if (!scoringRubric) return fail("项目评分标准无效，暂不能提交", 500);

  try {
    const scored = await runEvidenceScoring({
      project: {
        title: project.title,
        description: project.description,
        acceptanceCriteria: parseStringArray(project.acceptanceCriteria),
        rubric: scoringRubric,
      },
      snapshot,
      testRuns: allTestRuns,
      mainRun: mainRunRow,
      source,
      attemptId: attempt.id,
    });
    // 公开投影：只返回非 internal 证据（隐藏测试结果绝不外泄）。
    const review: ReviewResult = {
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
    const now = new Date().toISOString();
    appDb
      .insert(reviewFeedbacks)
      .values({
        attemptId: attempt.id,
        provider: review.provider,
        score: review.score,
        summary: review.summary,
        checklist: JSON.stringify(review.checklist),
        suggestions: JSON.stringify(review.suggestions),
        rubricResults: JSON.stringify(scored.review.rubricResults ?? []),
        acceptanceResults: JSON.stringify(scored.review.acceptanceResults ?? []),
        evidenceFacts: JSON.stringify(scored.review.evidenceFacts ?? []),
        capabilityNote: review.capabilityNote ?? "",
        createdAt: now,
      })
      .run();

    appDb.update(projectAttempts).set({ status: "reviewed", updatedAt: now }).where(eq(projectAttempts.id, attempt.id)).run();
    upsertProjectMastery({ userId, contentId: project.id, legacyContentId: `${project.courseId}:${project.id}`, mastery: review.score, now });

    return ok({
      attempt: { id: attempt.id, status: "reviewed", submittedAt },
      repository: snapshot,
      sandboxRun,
      publicTests,
      testRuns: publicTestRuns,
      review,
    });
  } catch (error) {
    const failure = describeAiProviderError(error, "代码评审");
    return fail(failure.message, 502, {
      code: failure.code,
      attemptId: attempt.id,
      repository: snapshot,
      sandboxRun,
    });
  }
}

/** 更新/创建项目学习记录（mastery + status=needs_review）。 */
function upsertProjectMastery(input: { userId: string; contentId: string; legacyContentId: string; mastery: number; now: string }) {
  const { userId, contentId, legacyContentId, mastery, now } = input;
  const existing = appDb
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, userId),
        eq(learningRecords.contentId, contentId),
        eq(learningRecords.contentType, "project")
      )
    )
    .get() ?? appDb
      .select()
      .from(learningRecords)
      .where(
        and(
          eq(learningRecords.userId, userId),
          eq(learningRecords.contentId, legacyContentId),
          eq(learningRecords.contentType, "project")
        )
      )
      .get();

  if (existing) {
    appDb
      .update(learningRecords)
      .set({ contentId, status: "needs_review", mastery, updatedAt: now })
      .where(eq(learningRecords.id, existing.id))
      .run();
  } else {
    appDb
      .insert(learningRecords)
      .values({
        userId,
        contentId,
        contentType: "project",
        status: "needs_review",
        mastery,
        errorHistory: "[]",
        updatedAt: now,
      })
      .run();
  }
}

async function handleCodeSubmit(code: string, userId: string, projectId: string) {
  const project = appDb.select().from(stageProjects).where(eq(stageProjects.id, projectId)).get();
  if (!project) return fail("项目不存在", 404);
  const rubric = parseProjectRubric(project.rubric);
  if (!rubric) return fail("项目评分标准无效，暂不能提交", 500);

  const submittedAt = new Date().toISOString();
  const inserted = appDb
    .insert(projectAttempts)
    .values({
      userId,
      projectId,
      code,
      status: "submitted",
      submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    })
    .returning()
    .get();

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

  upsertProjectMastery({ userId, contentId: project.id, legacyContentId: `${project.courseId}:${project.id}`, mastery: review.score, now });

  return ok({
    attempt: { id: inserted.id, status: "reviewed", submittedAt },
    review,
  });
}
