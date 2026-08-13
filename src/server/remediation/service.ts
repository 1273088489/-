// P2-06 补课路径服务：按最近一次失败评审（懒生成）创建 remediation_path，
// 读取时实时计算完成状态；完成补课更新项目 learning_record 的 mastery/status。
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import {
  exercises,
  learningRecords,
  lessons,
  projectAttempts,
  reviewFeedbacks,
  stageProjects,
  testCases,
  testRuns,
} from "@/server/db/schema";
import { parseJson } from "@/server/ai/json";
import type { LearningStatus, RemediationContentType, RemediationPathRecord } from "@/types";
import type { RemediationPath } from "@/server/db/schema";
import { evaluateItemCompleted, REMEDIATION_SCORE_THRESHOLD, type CompletionLookup } from "./builder";
import { buildRemediationPath } from "./builder";
import { mapSignalsToTargets } from "./mapper";
import { enhancePathExplanation } from "./enhance";
import {
  findRemediationPathByAttempt,
  getRemediationPathForUser,
  insertRemediationPath,
  listRemediationPaths,
  listRemediationPathsForProject,
  markRemediationPathCompleted,
  remediationPathRecord,
  resolveProjectTitle,
} from "./store";
import type { StoredRemediationItem } from "./types";

/** 完成补课后项目掌握度提升（封顶 100）。 */
export const REMEDIATION_MASTERY_BOOST = 20;
/** 完成补课后，达到该掌握度视为项目完成。 */
export const REMEDIATION_COMPLETED_MASTERY = 80;

export type GetOrCreatePathResult =
  | { ok: true; path: RemediationPathRecord | null }
  | { ok: false; code: "project-not-found" };

export type CompletePathResult =
  | { ok: true; path: RemediationPathRecord }
  | { ok: false; code: "not-found" | "items-pending"; remaining?: string[] };

// ---------------------------------------------------------------------------
// 学习记录查找（完成判定）
// ---------------------------------------------------------------------------

function normalizedContentId(contentId: string): string {
  // 兼容迁移早期的 courseId:contentId 记录：取冒号后的实体 id。
  return contentId.includes(":") ? contentId.slice(contentId.lastIndexOf(":") + 1) : contentId;
}

/** 为指定用户构建完成判定查询上下文（lesson/exercise 看 status，project 看 mastery）。 */
export function buildCompletionLookup(userId: string): CompletionLookup {
  const records = db
    .select()
    .from(learningRecords)
    .where(eq(learningRecords.userId, userId))
    .all();
  const byKey = new Map<string, { status?: string; mastery?: number }>();
  for (const record of records) {
    byKey.set(`${record.contentType}:${normalizedContentId(record.contentId)}`, {
      status: record.status,
      mastery: record.mastery,
    });
  }
  return {
    recordFor: (contentId: string, contentType: RemediationContentType) => byKey.get(`${contentType}:${normalizedContentId(contentId)}`),
  };
}

function contentTypeOf(value: unknown): RemediationContentType {
  return value === "lesson" || value === "exercise" || value === "project" ? value : "lesson";
}

function parseStoredItems(raw: string): StoredRemediationItem[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id ?? ""),
      orderIndex: Number(item.orderIndex ?? 0),
      contentType: contentTypeOf(item.contentType),
      contentId: String(item.contentId ?? ""),
      contentSlug: String(item.contentSlug ?? ""),
      title: String(item.title ?? ""),
      reason: String(item.reason ?? ""),
      criteria: String(item.criteria ?? ""),
    }))
    .filter((item) => item.contentId.length > 0);
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/**
 * 获取（必要时懒生成）某项目的补课路径：
 * - 无提交 / 未评分 / 得分达标且无失败信号 → 不生成；
 * - 已有该 attempt 的路径 → 直接返回（幂等）；
 * - 否则基于 errorHistory + 测试失败分类 + rubric 低分维度生成。
 */
export async function getOrCreateRemediationPath(
  userId: string,
  projectSlug: string,
): Promise<GetOrCreatePathResult> {
  const project = db.select().from(stageProjects).where(eq(stageProjects.slug, projectSlug)).get();
  if (!project) return { ok: false, code: "project-not-found" };

  const latestAttempt = db
    .select()
    .from(projectAttempts)
    .where(and(eq(projectAttempts.userId, userId), eq(projectAttempts.projectId, project.id)))
    .orderBy(desc(projectAttempts.submittedAt), desc(projectAttempts.createdAt))
    .get();
  if (!latestAttempt) return { ok: true, path: null };

  const existing = findRemediationPathByAttempt(latestAttempt.id);
  if (existing) {
    return { ok: true, path: projectRecord(existing, userId) };
  }

  const feedback = db
    .select()
    .from(reviewFeedbacks)
    .where(eq(reviewFeedbacks.attemptId, latestAttempt.id))
    .orderBy(desc(reviewFeedbacks.createdAt))
    .get();
  if (!feedback) return { ok: true, path: null };

  const score = feedback.score;
  const learning = db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, userId),
        eq(learningRecords.contentType, "project"),
        eq(learningRecords.contentId, project.id),
      ),
    )
    .get() ?? db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, userId),
        eq(learningRecords.contentType, "project"),
        eq(learningRecords.contentId, `${project.courseId}:${project.id}`),
      ),
    )
    .get();

  const errorHistory = Array.isArray(parseJson(learning?.errorHistory, []))
    ? (parseJson(learning?.errorHistory, []) as Record<string, unknown>[])
    : [];

  const runRows = db
    .select({ run: testRuns, testCase: testCases })
    .from(testRuns)
    .innerJoin(testCases, eq(testRuns.testCaseId, testCases.id))
    .where(eq(testRuns.attemptId, latestAttempt.id))
    .all();
  const testRunInputs = runRows.map(({ run, testCase }) => ({
    key: testCase.key,
    name: testCase.name,
    kind: testCase.kind === "hidden" ? "hidden" as const : "public" as const,
    passed: run.passed,
    status: run.status,
  }));

  const rubricResults = Array.isArray(parseJson(feedback.rubricResults, []))
    ? (parseJson(feedback.rubricResults, []) as Array<{ criterionId?: unknown; criterion?: unknown; level?: unknown; score?: unknown; weight?: unknown }>)
    : [];

  const signals = mapSignalsToTargets({
    errorHistory,
    testRuns: testRunInputs,
    rubricResults: rubricResults.map((item) => ({
      criterionId: String(item.criterionId ?? ""),
      criterion: String(item.criterion ?? ""),
      level: String(item.level ?? ""),
      score: Number(item.score ?? 0),
      weight: Number(item.weight ?? 0),
    })),
    projectSlug: project.slug,
  });

  if (score >= REMEDIATION_SCORE_THRESHOLD && signals.length === 0) {
    return { ok: true, path: null };
  }

  const built = buildRemediationPath({
    project: { id: project.id, slug: project.slug, title: project.title },
    score,
    signals,
    lessons: db.select().from(lessons).all(),
    exercises: db.select().from(exercises).all().map((row) => ({ id: row.id, slug: row.slug, title: row.prompt })),
    projects: db.select().from(stageProjects).all(),
  });

  if (built.items.length === 0) return { ok: true, path: null };

  const startedAt = new Date().toISOString();
  const explanation = await enhancePathExplanation({ base: built.explanation, items: built.items });
  // 幂等：插入前再次检查，避免并发重复生成。
  if (findRemediationPathByAttempt(latestAttempt.id)) {
    return { ok: true, path: projectRecord(findRemediationPathByAttempt(latestAttempt.id)!, userId) };
  }
  const row = insertRemediationPath({
    userId,
    attemptId: latestAttempt.id,
    projectId: project.id,
    items: built.items,
    source: built.source,
    explanation,
    startedAt,
  });
  return { ok: true, path: projectRecord(row, userId) };
}

/** 列出用户的补课路径（实时完成状态）。 */
export function listUserRemediationPaths(userId: string): RemediationPathRecord[] {
  const lookup = buildCompletionLookup(userId);
  return listRemediationPaths(userId).map((row) => projectRecord(row, userId, lookup));
}

/** 列出用户在某项目下的补课路径（实时完成状态；不触发生成）。 */
export function listUserRemediationPathsForProject(userId: string, projectId: string): RemediationPathRecord[] {
  const lookup = buildCompletionLookup(userId);
  return listRemediationPathsForProject(userId, projectId).map((row) => projectRecord(row, userId, lookup));
}

/** 获取单条补课路径（实时完成状态）。 */
export function getRemediationPathRecord(userId: string, pathId: string): RemediationPathRecord | null {
  const row = getRemediationPathForUser(pathId, userId);
  if (!row) return null;
  return projectRecord(row, userId);
}

// ---------------------------------------------------------------------------
// 完成补课
// ---------------------------------------------------------------------------

/**
 * 完成补课：所有项按学习记录判定完成 → 标记路径 completed，
 * 并更新项目 learning_record：mastery += 20（封顶 100），
 * mastery >= 80 时 status=completed，否则 in_progress。
 */
export function completeRemediationPath(userId: string, pathId: string): CompletePathResult {
  const row = getRemediationPathForUser(pathId, userId);
  if (!row) return { ok: false, code: "not-found" };

  if (row.status === "completed") {
    return { ok: true, path: projectRecord(row, userId) };
  }

  const lookup = buildCompletionLookup(userId);
  const items = parseStoredItems(row.items);
  const incomplete = items.filter((item) => !evaluateItemCompleted(item, lookup));
  if (incomplete.length > 0) {
    return {
      ok: false,
      code: "items-pending",
      remaining: incomplete.map((item) => item.title),
    };
  }

  const now = new Date().toISOString();
  const updated = markRemediationPathCompleted(row.id, now);
  if (!updated) return { ok: false, code: "not-found" };

  const project = db.select().from(stageProjects).where(eq(stageProjects.id, row.projectId)).get();
  if (project) {
    upsertProjectMasteryAfterRemediation({
      userId,
      projectId: project.id,
      legacyContentId: `${project.courseId}:${project.id}`,
      now,
    });
  }

  return { ok: true, path: projectRecord(updated, userId) };
}

/** 完成补课后更新项目学习记录（mastery 提升 + status 调整）。 */
function upsertProjectMasteryAfterRemediation(input: {
  userId: string;
  projectId: string;
  legacyContentId: string;
  now: string;
}) {
  const { userId, projectId, legacyContentId, now } = input;
  const existing = db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, userId),
        eq(learningRecords.contentId, projectId),
        eq(learningRecords.contentType, "project"),
      ),
    )
    .get() ?? db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, userId),
        eq(learningRecords.contentId, legacyContentId),
        eq(learningRecords.contentType, "project"),
      ),
    )
    .get();

  const mastery = Math.min(100, (existing?.mastery ?? 0) + REMEDIATION_MASTERY_BOOST);
  const status: LearningStatus = mastery >= REMEDIATION_COMPLETED_MASTERY ? "completed" : "in_progress";

  if (existing) {
    db.update(learningRecords)
      .set({ contentId: projectId, status, mastery, updatedAt: now })
      .where(eq(learningRecords.id, existing.id))
      .run();
  } else {
    db.insert(learningRecords)
      .values({
        userId,
        contentId: projectId,
        contentType: "project",
        status,
        mastery,
        errorHistory: "[]",
        updatedAt: now,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// 内部投影
// ---------------------------------------------------------------------------

function projectRecord(row: RemediationPath, userId: string, lookup?: CompletionLookup): RemediationPathRecord {
  const project = resolveProjectTitle(row.projectId);
  return remediationPathRecord(row, lookup ?? buildCompletionLookup(userId), project);
}
