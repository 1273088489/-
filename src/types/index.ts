// 与 docs/data-model-and-api.md 契约定格的前端类型定义。
// 所有类型均与后端 API 返回结构对齐；当 API 尚未实现时，客户端代码也完全依赖这些类型。

// —— 通用信封 ——
export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiFail {
  ok: false;
  error: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiFail;

// —— 认证 ——
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface Session {
  token?: string;
  expiresAt?: string;
  user?: User;
}

// —— 课程 ——
export type CourseProgress = number; // 0-100

export interface CourseSummary {
  slug: string;
  title: string;
  description: string;
  progress: CourseProgress;
  lessonCount?: number;
  projectCount?: number;
}

export type LearningStatus = "not_started" | "in_progress" | "completed" | "needs_review";
export type Mastery = number; // 0-100

export interface LessonSummary {
  slug: string;
  title: string;
  orderIndex: number;
  requiresPass: boolean;
  status?: LearningStatus;
  mastery?: Mastery;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  status?: LearningStatus;
  mastery?: Mastery;
}

export interface CourseDetail {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  progress: CourseProgress;
  lessons: LessonSummary[];
  projects: ProjectSummary[];
}

// —— 课时 ——
export type ExerciseAnswerType = "choices" | "text" | "code";

export interface ExerciseSummary {
  id: string;
  slug: string;
  prompt: string;
  answerType: ExerciseAnswerType;
  status?: LearningStatus;
  mastery?: Mastery;
}

export interface LessonDetail {
  id: string;
  slug: string;
  title: string;
  orderIndex: number;
  contentMarkdown: string;
  requiresPass: boolean;
  courseSlug: string;
  courseTitle: string;
  status?: LearningStatus;
  mastery?: Mastery;
  exercises: ExerciseSummary[];
  nextLessonSlug?: string | null;
  prevLessonSlug?: string | null;
}

// —— 练习 ——
export interface ExerciseDetail extends ExerciseSummary {
  hints: string[];
  rubric: string[];
  courseSlug: string;
  courseTitle: string;
  lessonSlug: string;
  lessonTitle: string;
  choices: string[];
}

export interface ExerciseResult {
  correct: boolean;
  feedback: string;
  mastery: Mastery;
  status?: LearningStatus;
  rubricResults?: Array<{
    criterion: string;
    evidenceStatus: "supported" | "unsupported";
    evidence: string[];
    missingEvidence: string[];
    nextStep: string;
  }>;
}

// —— 项目 ——
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

export interface ProjectDetail {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  tasks: string[];
  acceptanceCriteria: string[];
  guideMarkdown: string;
  deliverables: string[];
  rubric: ProjectRubricCriterion[];
  reflectionQuestions: string[];
  courseSlug?: string;
  courseTitle?: string;
  status?: LearningStatus;
  mastery?: Mastery;
  latestAttempt?: {
    id: string;
    code: string;
    status: string;
    submittedAt: string;
  } | null;
  latestRepository?: RepoSubmissionRecord | null;
  latestSandboxRun?: SandboxRunRecord | null;
  /** P2-04：公开测试定义（学习者可见；不含文件内容）。 */
  publicTests?: TestCaseRecord[];
  /** P2-04：最近一次仓库提交的公开测试运行结果。 */
  publicTestRuns?: TestRunRecord[];
  feedback?: ReviewResult | null;
}

export type ReviewSeverity = "blocker" | "suggestion" | "nit";

export interface ReviewChecklistItem {
  severity: ReviewSeverity;
  message: string;
  evidence?: string;
}

export interface ReviewResult {
  score: Mastery;
  summary: string;
  checklist: ReviewChecklistItem[];
  suggestions: string[];
  provider: string;
  rubricResults?: Array<{ criterionId: string; criterion: string; weight: number; level: "excellent" | "competent" | "developing" | "missing"; score: number; evidence: string[]; missingEvidence: string[]; nextStep: string }>;
  acceptanceResults?: Array<{ criterion: string; status: "supported" | "unsupported" | "unverifiable"; evidence: string[]; nextStep: string }>;
  capabilityNote?: string;
  /** P2-05：评分引用的证据（仅公开部分；internal 隐藏证据由服务端过滤）。 */
  evidenceFacts?: EvidenceFactRecord[];
  attempt?: {
    id: string;
    status: string;
    submittedAt: string;
  };
}


// —— Git 仓库接收（P2-02）——
export type RepoSourceType = "url" | "archive";

export interface RepoBranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
}

export interface RepoCommitInfo {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  subject: string;
}

export interface RepoLineRange {
  startLine: number;
  endLine: number;
  additions: number;
  deletions: number;
}

export interface RepoFileDiff {
  path: string;
  status: string;
  insertions: number;
  deletions: number;
  lineRanges: RepoLineRange[];
}

export interface RepoDiff {
  baseRef: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: RepoFileDiff[];
}

export interface RepoTreeStats {
  fileCount: number;
  totalBytes: number;
  largestFileBytes: number;
  files: string[];
}

export interface RepoHeadInfo {
  branch: string;
  commitHash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
}

export interface RepoSnapshot {
  source: {
    type: RepoSourceType;
    url?: string;
    archiveName?: string;
    archiveKind?: string;
  };
  head: RepoHeadInfo | null;
  branches: RepoBranchInfo[];
  commits: RepoCommitInfo[];
  diff: RepoDiff;
  tree: RepoTreeStats;
  analyzedAt: string;
}

export interface RepoSubmissionRecord {
  id: string;
  sourceType: RepoSourceType;
  sourceUrl: string;
  archiveName: string;
  archiveKind: string;
  status: "parsed" | "failed";
  snapshot: RepoSnapshot | null;
  error: string;
  submittedAt: string;
}

export interface RepoSubmissionResult {
  attempt: {
    id: string;
    status: string;
    submittedAt: string;
  };
  repository: RepoSnapshot;
  /** P2-03：仓库提交后触发的沙箱执行结果（沙箱不可用时可能为失败记录）。 */
  sandboxRun?: SandboxRunRecord | null;
  /** P2-04：公开测试定义与本次公开测试运行结果（隐藏测试不返回）。 */
  publicTests?: TestCaseRecord[];
  testRuns?: TestRunRecord[];
  /** P2-05：证据化 AI 评分（仓库提交；evidenceFacts 已过滤隐藏证据）。 */
  review?: ReviewResult | null;
}

// —— 沙箱执行（P2-03）——
export interface SandboxPhaseResult {
  phase: "install" | "build" | "test" | "verify";
  label: string;
  skipped?: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxRunRecord {
  id: string;
  attemptId: string;
  repositorySubmissionId: string;
  runtime: "node" | "static";
  status: "success" | "failed";
  errorCode: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  phases: SandboxPhaseResult[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  message: string;
}

// —— 测试执行（P2-04）——
/** 公开测试定义摘要（学习者可见；不含测试文件内容）。 */
export interface TestCaseRecord {
  id: string;
  name: string;
  framework: string;
}

/** 单个测试用例的运行结果（公开测试可返回给学习者；隐藏测试仅服务端使用）。 */
export interface TestRunRecord {
  id: string;
  testCaseId: string;
  name: string;
  framework: string;
  passed: boolean;
  status: "passed" | "failed" | "error" | "skipped";
  durationMs: number;
  message: string;
}

// —— 证据化评分（P2-05）——
/** 公开 API 返回的单条评分证据（internal 隐藏证据绝不返回）。 */
export interface EvidenceFactRecord {
  id: string;
  sourceType: "git_diff" | "test_output" | "file_content" | "runtime";
  label: string;
  detail: string;
  ref: string;
  createdAt: string;
}


// —— 个性化补课路径（P2-06）——
export type RemediationContentType = "lesson" | "exercise" | "project";

export interface RemediationItem {
  id: string;
  orderIndex: number;
  contentType: RemediationContentType;
  contentId: string;
  contentSlug: string;
  title: string;
  /** 推荐理由（学习者可见，不包含隐藏测试明细）。 */
  reason: string;
  /** 完成判定说明。 */
  criteria: string;
  /** 实时完成状态（由 learning_record / 项目掌握度判定）。 */
  completed: boolean;
  url: string;
}

export interface RemediationPathRecord {
  id: string;
  attemptId: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  status: "active" | "completed";
  items: RemediationItem[];
  /** 简短触发摘要（错误记录/未通过测试/低分维度）。 */
  summary: string;
  /** 规则引擎摘要 + AI 增强学习建议。 */
  explanation: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

// —— 仪表盘 ——
export interface RecentActivity {
  id?: string;
  label: string;
  contentId: string;
  contentType: "lesson" | "exercise" | "project";
  status: LearningStatus;
  mastery: Mastery;
  updatedAt: string;
  url: string;
}

export interface ProgressOverview {
  overallMastery: Mastery;
  completedLessons: number;
  totalLessons: number;
  completedProjects: number;
  totalProjects: number;
  completedExercises: number;
  totalExercises: number;
  statusCounts: Record<LearningStatus, number>;
  courses: CourseSummary[];
  recentActivities: RecentActivity[];
  nextLesson?: LessonSummary & { url?: string } | null;
}

// —— 选型实验 ——
export interface ChoiceOption {
  label: string;
  detail: string;
}

export interface ChoiceScenario {
  id: string;
  title: string;
  category?: string;
  description: string;
  options: string[] | ChoiceOption[];
  hint?: string;
}

export interface ChoiceSubmissionResult {
  score: Mastery;
  feedback: string;
}
