// P2-06 补课路径持久化与投影：remediation_path 行 <-> RemediationPathRecord（公开 API 类型）。
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { remediationPaths, stageProjects } from "@/server/db/schema";
import { parseJson } from "@/server/ai/json";
import type { RemediationPathRecord, RemediationItem } from "@/types";
import type { RemediationPath } from "@/server/db/schema";
import type { StoredRemediationItem } from "./types";
import { evaluateItemCompleted, type CompletionLookup } from "./builder";

export interface InsertRemediationPathInput {
  userId: string;
  attemptId: string;
  projectId: string;
  items: StoredRemediationItem[];
  source: unknown;
  explanation: string;
  startedAt: string;
}

export function insertRemediationPath(input: InsertRemediationPathInput): RemediationPath {
  const now = new Date().toISOString();
  const row = db
    .insert(remediationPaths)
    .values({
      userId: input.userId,
      attemptId: input.attemptId,
      projectId: input.projectId,
      status: "active",
      source: JSON.stringify(input.source),
      items: JSON.stringify(input.items),
      explanation: input.explanation,
      startedAt: input.startedAt,
      completedAt: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return row;
}

export function getRemediationPathById(id: string): RemediationPath | null {
  return db.select().from(remediationPaths).where(eq(remediationPaths.id, id)).get() ?? null;
}

export function getRemediationPathForUser(id: string, userId: string): RemediationPath | null {
  return db
    .select()
    .from(remediationPaths)
    .where(and(eq(remediationPaths.id, id), eq(remediationPaths.userId, userId)))
    .get() ?? null;
}

export function findRemediationPathByAttempt(attemptId: string): RemediationPath | null {
  return db
    .select()
    .from(remediationPaths)
    .where(eq(remediationPaths.attemptId, attemptId))
    .orderBy(desc(remediationPaths.createdAt))
    .get() ?? null;
}

export function listRemediationPaths(userId: string): RemediationPath[] {
  return db
    .select()
    .from(remediationPaths)
    .where(eq(remediationPaths.userId, userId))
    .orderBy(desc(remediationPaths.createdAt))
    .all();
}

export function listRemediationPathsForProject(userId: string, projectId: string): RemediationPath[] {
  return db
    .select()
    .from(remediationPaths)
    .where(and(eq(remediationPaths.userId, userId), eq(remediationPaths.projectId, projectId)))
    .orderBy(desc(remediationPaths.createdAt))
    .all();
}

export function markRemediationPathCompleted(id: string, completedAt: string): RemediationPath | null {
  const row = db
    .update(remediationPaths)
    .set({ status: "completed", completedAt, updatedAt: new Date().toISOString() })
    .where(eq(remediationPaths.id, id))
    .returning()
    .get();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// 投影（公开 API 结构）
// ---------------------------------------------------------------------------

function contentTypeOf(value: unknown): "lesson" | "exercise" | "project" {
  return value === "lesson" || value === "exercise" || value === "project" ? value : "lesson";
}

function parseItems(raw: string): StoredRemediationItem[] {
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

export function remediationItemUrl(item: Pick<StoredRemediationItem, "contentType" | "contentId" | "contentSlug">): string {
  if (item.contentType === "lesson") return `/lesson/${item.contentSlug}`;
  if (item.contentType === "project") return `/project/${item.contentSlug}`;
  return `/exercise/${item.contentId}`;
}

/** 把 remediation_path 行投影为公开类型；完成状态按当前学习记录实时计算。 */
export function remediationPathRecord(
  row: RemediationPath,
  lookup: CompletionLookup,
  project: { slug: string; title: string } | null = null,
): RemediationPathRecord {
  const items = parseItems(row.items);
  const resolvedProject = project ?? { slug: "", title: "" };
  const itemsWithCompletion: RemediationItem[] = items.map((item) => ({
    id: item.id,
    orderIndex: item.orderIndex,
    contentType: item.contentType,
    contentId: item.contentId,
    contentSlug: item.contentSlug,
    title: item.title,
    reason: item.reason,
    criteria: item.criteria,
    completed: evaluateItemCompleted(item, lookup),
    url: remediationItemUrl(item),
  }));

  return {
    id: row.id,
    attemptId: row.attemptId,
    projectId: row.projectId,
    projectSlug: resolvedProject.slug,
    projectTitle: resolvedProject.title,
    status: row.status === "completed" ? "completed" : "active",
    items: itemsWithCompletion,
    summary: summarizeSource(parseJson<Record<string, unknown>>(row.source, {})),
    explanation: row.explanation,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function summarizeSource(source: Record<string, unknown>): string {
  const parts: string[] = [];
  const errorCount = Number(source.errorHistoryCount ?? 0);
  const testCount = Number(source.testFailureCount ?? 0);
  const rubricCount = Number(source.rubricLowCount ?? 0);
  if (errorCount > 0) parts.push(`错误记录 ${errorCount} 类`);
  if (testCount > 0) parts.push(`未通过测试 ${testCount} 类`);
  if (rubricCount > 0) parts.push(`低分维度 ${rubricCount} 个`);
  if (parts.length === 0) return "基于最近一次评审得分生成";
  return `由${parts.join("、")}触发`;
}

/** 根据 projectId 批量解析项目标题（投影用）。 */
export function resolveProjectTitle(projectId: string): { slug: string; title: string } | null {
  const row = db.select().from(stageProjects).where(eq(stageProjects.id, projectId)).get();
  return row ? { slug: row.slug, title: row.title } : null;
}
