// P2-06 个性化补课路径 —— 内部类型。
// 输入：learning_record.errorHistory + 测试失败分类 + rubric 低分维度；
// 输出：remediation_path（目标 lesson/exercise/project、顺序、完成判定）。
import type { RemediationContentType } from "@/types";

/** 补课信号的来源类型。 */
export type RemediationSignalKind = "error-history" | "test-failure" | "rubric-low";

/** 单个学习目标引用（规则引擎输出，slug 形式；入库前解析为 DB id）。 */
export interface LearningTargetRef {
  contentType: RemediationContentType;
  /** 课程数据中的稳定 slug（lesson/exercise/project）。 */
  slug: string;
  /** 该目标的推荐理由（学习者可见，不包含隐藏测试明细）。 */
  reason: string;
}

/** 规则引擎产出的一条补课信号（错误类型 → 学习内容映射）。 */
export interface RemediationSignal {
  kind: RemediationSignalKind;
  /** 命中规则的稳定 id（供测试与调试）。 */
  ruleId: string;
  /** 人类可读的触发摘要（学习者可见）。 */
  label: string;
  targets: LearningTargetRef[];
}

/** errorHistory 单条输入（字段不固定，按关键字分类）。 */
export type ErrorHistoryEntryInput = Record<string, unknown>;

/** 测试运行输入（含隐藏测试，仅服务端用于分类；隐藏明细绝不进入原因文本）。 */
export interface TestRunSignalInput {
  key: string;
  name: string;
  kind: "public" | "hidden";
  passed: boolean;
  status: string;
}

/** rubric 低分维度输入（来自 review_feedback.rubricResults）。 */
export interface RubricLowDimensionInput {
  criterionId: string;
  criterion: string;
  level: string;
  score: number;
  weight: number;
}

/** 已入库补课项（remediation_path.items JSON 元素）。 */
export interface StoredRemediationItem {
  id: string;
  orderIndex: number;
  contentType: RemediationContentType;
  contentId: string;
  contentSlug: string;
  title: string;
  reason: string;
  /** 完成判定说明（学习者可见）。 */
  criteria: string;
}

/** remediation_path.source JSON：生成时输入的摘要。 */
export interface RemediationSource {
  score: number;
  errorHistoryCount: number;
  testFailureCount: number;
  rubricLowCount: number;
  errors: Array<{ ruleId: string; label: string }>;
  tests: Array<{ ruleId: string; label: string }>;
  rubrics: Array<{ ruleId: string; label: string }>;
}

/** 补课路径构建输入。 */
export interface BuildPathInput {
  project: { id: string; slug: string; title: string };
  score: number;
  signals: RemediationSignal[];
  lessons: Array<{ id: string; slug: string; title: string }>;
  exercises: Array<{ id: string; slug: string; title: string }>;
  projects: Array<{ id: string; slug: string; title: string }>;
}

/** 补课路径构建结果（持久化前的结构）。 */
export interface BuiltRemediationPath {
  source: RemediationSource;
  items: StoredRemediationItem[];
  /** 规则引擎摘要（不含 AI）。 */
  explanation: string;
}

/** 内容解析上下文（slug → 已入库内容行）。 */
export interface ContentCatalog {
  lessonBySlug: Map<string, { id: string; slug: string; title: string }>;
  exerciseBySlug: Map<string, { id: string; slug: string; title: string }>;
  projectBySlug: Map<string, { id: string; slug: string; title: string }>;
}
