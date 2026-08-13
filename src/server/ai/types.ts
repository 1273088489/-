// AI 适配层契约。所有 AI 能力通过本接口，便于 mock / 真实 provider 切换。

export interface CoachParams {
  question: string;
  level: number; // 1..3 hints, or 4 = solution
  context?: string; // 当前课程/练习/代码上下文
}

export interface CoachResult {
  text: string;
  level: number;
  mode: "hint" | "solution";
}

export interface ProjectRubricCriterion {
  id: string;
  criterion: string;
  weight: number;
  evidence: string[];
  levels: {
    excellent: string;
    competent: string;
    developing: string;
    missing: string;
  };
}

export interface ProjectReviewContext {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  rubric: ProjectRubricCriterion[];
}

// —— P2-05 证据化评分 ——
/** 证据来源类型（evidence_fact.source_type）。 */
export type EvidenceFactSourceType = "git_diff" | "test_output" | "file_content" | "runtime";

/** 评分引用的单条证据（可持久化到 evidence_fact 或由 AI 输出）。 */
export interface EvidenceFact {
  sourceType: EvidenceFactSourceType;
  /** 人类可读标题，如“公开测试：说明页包含名称、目标用户”。 */
  label: string;
  /** 证据详情：断言/输出摘要/文件内容摘要/运行信息。 */
  detail: string;
  /** 结构化引用，如 file:README.md / test:<key> / run:<id>。 */
  ref?: string;
  /** true 表示仅服务端使用（如隐藏测试），绝不进入公开 API/UI。 */
  internal?: boolean;
}

/** 评分输入中的单条测试运行结果（含隐藏测试，仅服务端）。 */
export interface ReviewEvidenceTestRun {
  key: string;
  name: string;
  kind: "public" | "hidden";
  passed: boolean;
  status: "passed" | "failed" | "error" | "skipped";
  durationMs: number;
  message: string;
  framework: string;
}

/** 评分输入中的主沙箱运行摘要（P2-03 main 运行）。 */
export interface ReviewEvidenceRuntime {
  status: "success" | "failed";
  errorCode: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  message: string;
  phases: Array<{
    phase: string;
    label: string;
    skipped?: boolean;
    exitCode: number | null;
    durationMs: number;
    stdout: string;
    stderr: string;
  }>;
}

/** 评分输入中的仓库文件内容（受限读取，供 file_content 证据与 rubric 匹配）。 */
export interface ReviewEvidenceFileContent {
  path: string;
  content: string;
}

/** 评分输入中的仓库快照摘要（P2-02 RepoSnapshot 的结构化投影）。 */
export interface ReviewEvidenceRepository {
  sourceType: "url" | "archive";
  head?: { branch: string; shortHash: string; subject: string } | null;
  branches: Array<{ name: string; isHead: boolean }>;
  commits: Array<{ shortHash: string; subject: string }>;
  diff: {
    baseRef: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
    files: Array<{ path: string; status: string; insertions: number; deletions: number }>;
  };
  tree: { fileCount: number; totalBytes: number; files: string[] };
}

/** 证据化评分的输入：仓库快照 + 测试运行（公开+隐藏）+ 沙箱运行 + 文件内容。 */
export interface ReviewEvidenceInput {
  repository?: ReviewEvidenceRepository;
  testRuns?: ReviewEvidenceTestRun[];
  runtime?: ReviewEvidenceRuntime | null;
  fileContents?: ReviewEvidenceFileContent[];
}

export interface ReviewInput {
  /** 文本/代码提交内容；仓库提交时为 ""（证据放在 evidence）。 */
  code: string;
  project: ProjectReviewContext;
  /** P2-05：仓库提交的证据（真实采集，禁止臆造）。 */
  evidence?: ReviewEvidenceInput;
}

export interface ReviewChecklistItem {
  severity: "blocker" | "suggestion" | "nit";
  message: string;
  evidence?: string;
}

export type EvidenceStatus = "supported" | "unsupported" | "unverifiable";
export type RubricLevel = "excellent" | "competent" | "developing" | "missing";

export interface RubricReviewItem {
  criterionId: string;
  criterion: string;
  weight: number;
  level: RubricLevel;
  score: number;
  evidence: string[];
  missingEvidence: string[];
  nextStep: string;
}

export interface AcceptanceReviewItem {
  criterion: string;
  status: EvidenceStatus;
  evidence: string[];
  nextStep: string;
}

export interface ReviewResult {
  score: number; // 0-100
  summary: string;
  checklist: ReviewChecklistItem[];
  suggestions: string[];
  provider: string;
  rubricResults?: RubricReviewItem[];
  acceptanceResults?: AcceptanceReviewItem[];
  capabilityNote?: string;
  /** P2-05：评分引用的证据（internal 项仅服务端，公开 API 需过滤）。 */
  evidenceFacts?: EvidenceFact[];
}

export interface ChoiceLabInput {
  scenario: string;
  options: string[];
  selectedOption: string;
  rationale: string;
}

export interface ChoiceLabResult {
  score: number; // 0-100
  feedback: string;
}

export interface AiProvider {
  readonly name: string;
  coach(params: CoachParams): Promise<CoachResult>;
  review(input: ReviewInput): Promise<ReviewResult>;
  evaluateChoice(input: ChoiceLabInput): Promise<ChoiceLabResult>;
}

export type ProviderName = "openai" | "mock";
