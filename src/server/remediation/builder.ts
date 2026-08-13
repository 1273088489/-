// P2-06 补课路径构建：把规则引擎信号解析为已入库内容（lesson/exercise/project），
// 排序（课时 → 练习 → 项目重交）、去重、限长，并生成完成判定说明与规则摘要。
import { randomUUID } from "node:crypto";
import type {
  BuildPathInput,
  BuiltRemediationPath,
  ContentCatalog,
  RemediationSignal,
  StoredRemediationItem,
} from "./types";
import type { RemediationContentType } from "@/types";

/** 补课路径默认通过线：评审得分低于该值视为需要补课。 */
export const REMEDIATION_SCORE_THRESHOLD = 80;
/** 项目补课完成后重新提交的最低掌握度（判定项目类补课项完成）。 */
export const PROJECT_PASS_MASTERY = 80;
/** 单条补课路径的最大项数。 */
export const MAX_REMEDIATION_ITEMS = 6;

const CONTENT_TYPE_ORDER: Record<RemediationContentType, number> = {
  lesson: 0,
  exercise: 1,
  project: 2,
};

export function buildContentCatalog(input: BuildPathInput): ContentCatalog {
  return {
    lessonBySlug: new Map(input.lessons.map((row) => [row.slug, row])),
    exerciseBySlug: new Map(input.exercises.map((row) => [row.slug, row])),
    projectBySlug: new Map(input.projects.map((row) => [row.slug, row])),
  };
}

function resolveTarget(
  target: { contentType: RemediationContentType; slug: string; reason: string },
  catalog: ContentCatalog,
): StoredRemediationItem | null {
  if (target.contentType === "lesson") {
    const row = catalog.lessonBySlug.get(target.slug);
    return row ? { id: randomUUID(), orderIndex: 0, contentType: "lesson", contentId: row.id, contentSlug: row.slug, title: row.title, reason: target.reason, criteria: "完成该课时（状态变为已完成）" } : null;
  }
  if (target.contentType === "exercise") {
    const row = catalog.exerciseBySlug.get(target.slug);
    return row ? { id: randomUUID(), orderIndex: 0, contentType: "exercise", contentId: row.id, contentSlug: row.slug, title: row.title, reason: target.reason, criteria: "正确完成该练习（状态变为已完成）" } : null;
  }
  const row = catalog.projectBySlug.get(target.slug);
  return row ? { id: randomUUID(), orderIndex: 0, contentType: "project", contentId: row.id, contentSlug: row.slug, title: row.title, reason: target.reason, criteria: "按建议补齐后重新提交项目，评审得分达到 80 分" } : null;
}

/** 汇总信号计数（用于 source 与摘要）。 */
export function countSignals(signals: RemediationSignal[]): { errors: number; tests: number; rubrics: number } {
  return {
    errors: signals.filter((signal) => signal.kind === "error-history").length,
    tests: signals.filter((signal) => signal.kind === "test-failure").length,
    rubrics: signals.filter((signal) => signal.kind === "rubric-low").length,
  };
}

/** 构建补课路径（不含 AI 增强；explanation 为规则摘要）。 */
export function buildRemediationPath(input: BuildPathInput): BuiltRemediationPath {
  const { project, score, signals } = input;
  const catalog = buildContentCatalog(input);

  // 1) 解析并去重（同一内容只保留首个理由）。
  const seen = new Set<string>();
  const resolved: StoredRemediationItem[] = [];
  for (const signal of signals) {
    for (const target of signal.targets) {
      const item = resolveTarget(target, catalog);
      if (!item) continue;
      const key = `${item.contentType}:${item.contentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(item);
    }
  }

  // 2) 低分且尚未包含项目重交时，补一个项目重交目标。
  if (score < REMEDIATION_SCORE_THRESHOLD && !seen.has(`project:${project.id}`)) {
    resolved.push({
      id: randomUUID(),
      orderIndex: 0,
      contentType: "project",
      contentId: project.id,
      contentSlug: project.slug,
      title: project.title,
      reason: `最近一次评审得分 ${score}/100，未达到 ${REMEDIATION_SCORE_THRESHOLD} 分通过线`,
      criteria: "按建议补齐后重新提交项目，评审得分达到 80 分",
    });
    seen.add(`project:${project.id}`);
  }

  // 3) 排序：课时 → 练习 → 项目（组内保持规则产生顺序）；项目重交恒排最后。
  const projectItems = resolved.filter((item) => item.contentType === "project");
  const nonProject = resolved
    .filter((item) => item.contentType !== "project")
    .sort((a, b) => CONTENT_TYPE_ORDER[a.contentType] - CONTENT_TYPE_ORDER[b.contentType]);
  const ordered = [...nonProject.slice(0, MAX_REMEDIATION_ITEMS - projectItems.length), ...projectItems]
    .map((item, index) => ({ ...item, orderIndex: index }));

  // 4) 规则摘要。
  const counts = countSignals(signals);
  const explanation = buildRuleExplanation({ projectTitle: project.title, score, counts, itemCount: ordered.length });

  return {
    source: {
      score,
      errorHistoryCount: counts.errors,
      testFailureCount: counts.tests,
      rubricLowCount: counts.rubrics,
      errors: signals.filter((signal) => signal.kind === "error-history").map((signal) => ({ ruleId: signal.ruleId, label: signal.label })),
      tests: signals.filter((signal) => signal.kind === "test-failure").map((signal) => ({ ruleId: signal.ruleId, label: signal.label })),
      rubrics: signals.filter((signal) => signal.kind === "rubric-low").map((signal) => ({ ruleId: signal.ruleId, label: signal.label })),
    },
    items: ordered,
    explanation,
  };
}

/** 规则引擎摘要（AI 增强由 enhance.ts 追加，不改变本函数）。 */
export function buildRuleExplanation(input: {
  projectTitle: string;
  score: number;
  counts: { errors: number; tests: number; rubrics: number };
  itemCount: number;
}): string {
  const { projectTitle, score, counts, itemCount } = input;
  const triggers: string[] = [];
  if (counts.errors > 0) triggers.push(`错误记录 ${counts.errors} 类`);
  if (counts.tests > 0) triggers.push(`未通过测试 ${counts.tests} 类`);
  if (counts.rubrics > 0) triggers.push(`低分维度 ${counts.rubrics} 个`);
  const triggerText = triggers.length > 0 ? `基于${triggers.join("、")}生成` : "基于最近一次评审得分生成";
  return `项目「${projectTitle}」最近一次评审得分 ${score}/100，未达到 ${REMEDIATION_SCORE_THRESHOLD} 分通过线。${triggerText}。补课路径共 ${itemCount} 步：先复习课时，再做练习，最后重新提交项目。`;
}

// ---------------------------------------------------------------------------
// 完成判定
// ---------------------------------------------------------------------------
export interface CompletionLookup {
  /** 返回某内容的学习记录状态与掌握度（无记录返回 undefined）。 */
  recordFor: (contentId: string, contentType: RemediationContentType) => { status?: string; mastery?: number } | undefined;
}

/** 单项完成判定：
 * - lesson：learning_record.status === completed
 * - exercise：learning_record.status === completed
 * - project：learning_record.mastery >= PROJECT_PASS_MASTERY（重新提交并获得足够分数）
 */
export function evaluateItemCompleted(
  item: Pick<StoredRemediationItem, "contentType" | "contentId">,
  lookup: CompletionLookup,
): boolean {
  const record = lookup.recordFor(item.contentId, item.contentType);
  if (item.contentType === "lesson" || item.contentType === "exercise") {
    return record?.status === "completed";
  }
  return (record?.mastery ?? 0) >= PROJECT_PASS_MASTERY;
}
