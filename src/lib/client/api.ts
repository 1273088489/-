// 统一的前端 API 客户端：所有请求基于 docs/data-model-and-api.md 契约。
// 约定：GET 返回 `{ ok: true, data }`，错误时解析 `{ ok: false, error }` 并抛出 ApiError。
import type {
  ApiFail,
  ApiOk,
  ChoiceScenario,
  ChoiceSubmissionResult,
  CourseDetail,
  CourseSummary,
  ExerciseDetail,
  ExerciseResult,
  LessonDetail,
  ProgressOverview,
  ProjectDetail,
  ProjectRubricCriterion,
  RemediationPathRecord,
  RepoSnapshot,
  RepoSubmissionRecord,
  RepoSubmissionResult,
  SandboxRunRecord,
  ReviewResult,
  Session,
  TestCaseRecord,
  TestRunRecord,
  User,
} from "@/types";

export type HttpMethod = "GET" | "POST";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * 基础 fetch 封装：处理网络错误、非 JSON 响应、统一 `{ok,error}` 信封。
 * 兼容 API 尚未实现时应有的行为（404/500 会以 ApiError 形式暴露，由页面渲染错误态）。
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      // FormData 由浏览器自动带 multipart boundary，不能手动设置 Content-Type。
      headers: body === undefined || isFormData ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError("网络请求失败，请检查连接后重试。", 0, err);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`服务返回了无法解析的响应（HTTP ${response.status}）。`, response.status);
  }

  if (!response.ok || !isApiOk(payload)) {
    const fail = payload as Partial<ApiFail> | null;
    throw new ApiError(fail?.error ?? `请求失败（HTTP ${response.status}）`, response.status, payload);
  }
  return (payload as ApiOk<T>).data;
}

function isApiOk(value: unknown): value is ApiOk<unknown> {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true;
}

function asRecord(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null ? (value as Record<string, any>) : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function projectRubric(value: unknown): ProjectRubricCriterion[] {
  return asArray(value).map((value) => {
    const criterion = asRecord(value);
    const levels = asRecord(criterion.levels);
    return {
      id: String(criterion.id ?? ""),
      criterion: String(criterion.criterion ?? ""),
      weight: Number(criterion.weight ?? 0),
      evidence: asArray(criterion.evidence).map(String),
      levels: {
        excellent: String(levels.excellent ?? ""),
        competent: String(levels.competent ?? ""),
        developing: String(levels.developing ?? ""),
        missing: String(levels.missing ?? ""),
      },
    };
  });
}

function progressValue(value: unknown): number {
  if (typeof value === "number") return value;
  const progress = asRecord(value);
  return Number(progress.percent ?? progress.mastery ?? progress.avgMastery ?? 0);
}

// —— 认证 ——
export function apiLogin(body: { email: string; password: string }): Promise<Session> {
  return request<Session>("/api/auth/login", { method: "POST", body });
}
export function apiRegister(body: { email: string; name: string; password: string }): Promise<Session> {
  return request<Session>("/api/auth/register", { method: "POST", body });
}
export function apiLogout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}
export function apiMe(): Promise<User | null> {
  return request<User>("/api/auth/me");
}

// —— 课程 / 进度 ——
export function apiCourses(): Promise<CourseSummary[]> {
  return request<CourseSummary[]>("/api/course");
}
export function apiCourseDetail(slug: string): Promise<CourseDetail> {
  return request<CourseDetail>(`/api/course/${encodeURIComponent(slug)}`);
}
export function apiProgress(): Promise<ProgressOverview> {
  return request<ProgressOverview>("/api/progress");
}

// —— 课时 / 练习 / 项目 ——
export function apiLesson(slug: string): Promise<LessonDetail> {
  return request<LessonDetail>(`/api/lesson/${encodeURIComponent(slug)}`);
}
export function apiCompleteLesson(slug: string, mastery?: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/lesson/${encodeURIComponent(slug)}/complete`, { method: "POST", body: { mastery } });
}
export function apiExercise(id: string): Promise<ExerciseDetail> {
  return request<ExerciseDetail>(`/api/exercise/${encodeURIComponent(id)}`);
}
export function apiSubmitExercise(id: string, answer: unknown): Promise<ExerciseResult> {
  return request<ExerciseResult>(`/api/exercise/${encodeURIComponent(id)}/submit`, { method: "POST", body: { answer } });
}
export function apiProject(slug: string): Promise<ProjectDetail> {
  return request<unknown>(`/api/project/${encodeURIComponent(slug)}`).then((data) => {
    const project = asRecord(data);
    const feedback = project.feedback ? asRecord(project.feedback) : null;
    return {
      slug: String(project.slug ?? slug),
      title: String(project.title ?? "未命名项目"),
      description: String(project.description ?? ""),
      orderIndex: Number(project.orderIndex ?? 0),
      tasks: asArray(project.tasks).map(String),
      acceptanceCriteria: asArray(project.acceptanceCriteria).map(String),
      guideMarkdown: String(project.guideMarkdown ?? ""),
      deliverables: asArray(project.deliverables).map(String),
      rubric: projectRubric(project.rubric),
      reflectionQuestions: asArray(project.reflectionQuestions).map(String),
      status: project.status ?? "not_started",
      mastery: Number(project.mastery ?? 0),
      latestAttempt: project.latestAttempt ?? null,
      latestRepository: project.latestRepository ? repoSubmissionRecord(project.latestRepository) : null,
      latestSandboxRun: project.latestSandboxRun ? sandboxRunRecord(project.latestSandboxRun) : null,
      publicTests: asArray(project.publicTests).map(testCaseRecord),
      publicTestRuns: asArray(project.publicTestRuns).map(testRunRecord),
      feedback: feedback ? reviewResult(feedback) : null,
    } as ProjectDetail;
  });
}
export function apiSubmitProject(slug: string, code: string): Promise<ReviewResult> {
  return request<unknown>(`/api/project/${encodeURIComponent(slug)}/submit`, { method: "POST", body: { code } }).then((data) => {
    const root = asRecord(data);
    const review = asRecord(root.review);
    return { ...review, attempt: root.attempt } as ReviewResult;
  });
}

function repoLineRange(value: unknown): RepoSubmissionResult["repository"]["diff"]["files"][number]["lineRanges"][number] {
  const range = asRecord(value);
  return {
    startLine: Number(range.startLine ?? 0),
    endLine: Number(range.endLine ?? 0),
    additions: Number(range.additions ?? 0),
    deletions: Number(range.deletions ?? 0),
  };
}

function repoFileDiff(value: unknown): RepoSubmissionResult["repository"]["diff"]["files"][number] {
  const file = asRecord(value);
  return {
    path: String(file.path ?? ""),
    status: String(file.status ?? "modified"),
    insertions: Number(file.insertions ?? 0),
    deletions: Number(file.deletions ?? 0),
    lineRanges: asArray(file.lineRanges).map(repoLineRange),
  };
}

function repoSnapshot(value: unknown): RepoSnapshot {
  const root = asRecord(value);
  const source = asRecord(root.source);
  const head = root.head ? asRecord(root.head) : null;
  const diff = asRecord(root.diff);
  const tree = asRecord(root.tree);
  return {
    source: {
      type: source.type === "archive" ? "archive" : "url",
      url: source.url ? String(source.url) : undefined,
      archiveName: source.archiveName ? String(source.archiveName) : undefined,
      archiveKind: source.archiveKind ? String(source.archiveKind) : undefined,
    },
    head: head
      ? {
          branch: String(head.branch ?? ""),
          commitHash: String(head.commitHash ?? ""),
          shortHash: String(head.shortHash ?? ""),
          subject: String(head.subject ?? ""),
          authorName: String(head.authorName ?? ""),
          authorEmail: String(head.authorEmail ?? ""),
          committedAt: String(head.committedAt ?? ""),
        }
      : null,
    branches: asArray(root.branches).map((item) => {
      const branch = asRecord(item);
      return {
        name: String(branch.name ?? ""),
        isHead: branch.isHead === true,
        isRemote: branch.isRemote === true,
      };
    }),
    commits: asArray(root.commits).map((item) => {
      const commit = asRecord(item);
      return {
        hash: String(commit.hash ?? ""),
        shortHash: String(commit.shortHash ?? ""),
        authorName: String(commit.authorName ?? ""),
        authorEmail: String(commit.authorEmail ?? ""),
        committedAt: String(commit.committedAt ?? ""),
        subject: String(commit.subject ?? ""),
      };
    }),
    diff: {
      baseRef: String(diff.baseRef ?? ""),
      filesChanged: Number(diff.filesChanged ?? 0),
      insertions: Number(diff.insertions ?? 0),
      deletions: Number(diff.deletions ?? 0),
      files: asArray(diff.files).map(repoFileDiff),
    },
    tree: {
      fileCount: Number(tree.fileCount ?? 0),
      totalBytes: Number(tree.totalBytes ?? 0),
      largestFileBytes: Number(tree.largestFileBytes ?? 0),
      files: asArray(tree.files).map(String),
    },
    analyzedAt: String(root.analyzedAt ?? ""),
  };
}

function repoSubmissionRecord(value: unknown): RepoSubmissionRecord {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ""),
    sourceType: record.sourceType === "archive" ? "archive" : "url",
    sourceUrl: String(record.sourceUrl ?? ""),
    archiveName: String(record.archiveName ?? ""),
    archiveKind: String(record.archiveKind ?? ""),
    status: record.status === "failed" ? "failed" : "parsed",
    snapshot: record.snapshot ? repoSnapshot(record.snapshot) : null,
    error: String(record.error ?? ""),
    submittedAt: String(record.submittedAt ?? ""),
  };
}

function sandboxPhaseResult(value: unknown): SandboxRunRecord["phases"][number] {
  const phase = asRecord(value);
  return {
    phase: phase.phase === "install" || phase.phase === "build" || phase.phase === "test" || phase.phase === "verify" ? phase.phase : "verify",
    label: String(phase.label ?? ""),
    skipped: phase.skipped === true,
    exitCode: phase.exitCode === null || phase.exitCode === undefined ? null : Number(phase.exitCode),
    stdout: String(phase.stdout ?? ""),
    stderr: String(phase.stderr ?? ""),
    durationMs: Number(phase.durationMs ?? 0),
  };
}

function sandboxRunRecord(value: unknown): SandboxRunRecord {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ""),
    attemptId: String(record.attemptId ?? ""),
    repositorySubmissionId: String(record.repositorySubmissionId ?? ""),
    runtime: record.runtime === "static" ? "static" : "node",
    status: record.status === "failed" ? "failed" : "success",
    errorCode: String(record.errorCode ?? ""),
    exitCode: record.exitCode === null || record.exitCode === undefined ? null : Number(record.exitCode),
    stdout: String(record.stdout ?? ""),
    stderr: String(record.stderr ?? ""),
    phases: asArray(record.phases).map(sandboxPhaseResult),
    startedAt: String(record.startedAt ?? ""),
    finishedAt: String(record.finishedAt ?? ""),
    durationMs: Number(record.durationMs ?? 0),
    timedOut: record.timedOut === true,
    oomKilled: record.oomKilled === true,
    message: String(record.message ?? ""),
  };
}

function testCaseRecord(value: unknown): TestCaseRecord {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    framework: String(record.framework ?? "static-check"),
  };
}

function testRunRecord(value: unknown): TestRunRecord {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ""),
    testCaseId: String(record.testCaseId ?? ""),
    name: String(record.name ?? ""),
    framework: String(record.framework ?? "static-check"),
    passed: record.passed === true,
    status: record.status === "passed" || record.status === "failed" || record.status === "error" || record.status === "skipped" ? record.status : "failed",
    durationMs: Number(record.durationMs ?? 0),
    message: String(record.message ?? ""),
  };
}

function evidenceFactRecord(value: unknown): NonNullable<ReviewResult["evidenceFacts"]>[number] {
  const record = asRecord(value);
  const sourceType = record.sourceType;
  return {
    id: String(record.id ?? ""),
    sourceType: sourceType === "git_diff" || sourceType === "test_output" || sourceType === "file_content" || sourceType === "runtime" ? sourceType : "file_content",
    label: String(record.label ?? ""),
    detail: String(record.detail ?? ""),
    ref: String(record.ref ?? ""),
    createdAt: String(record.createdAt ?? ""),
  };
}

function reviewResult(value: unknown): ReviewResult {
  const review = asRecord(value);
  const attempt = review.attempt ? asRecord(review.attempt) : null;
  return {
    score: Number(review.score ?? 0),
    summary: String(review.summary ?? ""),
    checklist: asArray(review.checklist),
    suggestions: asArray(review.suggestions).map(String),
    provider: String(review.provider ?? "unknown"),
    rubricResults: asArray(review.rubricResults),
    acceptanceResults: asArray(review.acceptanceResults),
    capabilityNote: typeof review.capabilityNote === "string" ? review.capabilityNote : undefined,
    evidenceFacts: asArray(review.evidenceFacts).map(evidenceFactRecord),
    ...(attempt ? { attempt: { id: String(attempt.id ?? ""), status: String(attempt.status ?? ""), submittedAt: String(attempt.submittedAt ?? "") } } : {}),
  };
}

function repoSubmissionResult(value: unknown): RepoSubmissionResult {
  const root = asRecord(value);
  const attempt = asRecord(root.attempt);
  return {
    attempt: {
      id: String(attempt.id ?? ""),
      status: String(attempt.status ?? "submitted"),
      submittedAt: String(attempt.submittedAt ?? ""),
    },
    repository: repoSnapshot(root.repository),
    sandboxRun: root.sandboxRun ? sandboxRunRecord(root.sandboxRun) : null,
    publicTests: asArray(root.publicTests).map(testCaseRecord),
    testRuns: asArray(root.testRuns).map(testRunRecord),
    review: root.review ? reviewResult(root.review) : null,
  };
}

/** 提交 Git 仓库地址（仅 https），返回仓库解析快照。 */
export function apiSubmitProjectRepo(slug: string, repoUrl: string): Promise<RepoSubmissionResult> {
  return request<unknown>(`/api/project/${encodeURIComponent(slug)}/submit`, { method: "POST", body: { repoUrl } }).then(repoSubmissionResult);
}

/** 上传 .zip / .tar.gz 压缩包，返回仓库解析快照。 */
export function apiSubmitProjectArchive(slug: string, file: File): Promise<RepoSubmissionResult> {
  const formData = new FormData();
  formData.set("archive", file);
  return request<unknown>(`/api/project/${encodeURIComponent(slug)}/submit`, { method: "POST", body: formData }).then(repoSubmissionResult);
}

// —— 个性化补课路径（P2-06）——
function remediationItem(value: unknown): RemediationPathRecord["items"][number] {
  const item = asRecord(value);
  const contentType = item.contentType;
  return {
    id: String(item.id ?? ""),
    orderIndex: Number(item.orderIndex ?? 0),
    contentType: contentType === "exercise" || contentType === "project" ? contentType : "lesson",
    contentId: String(item.contentId ?? ""),
    contentSlug: String(item.contentSlug ?? ""),
    title: String(item.title ?? ""),
    reason: String(item.reason ?? ""),
    criteria: String(item.criteria ?? ""),
    completed: item.completed === true,
    url: String(item.url ?? ""),
  };
}

function remediationPathRecord(value: unknown): RemediationPathRecord {
  const path = asRecord(value);
  return {
    id: String(path.id ?? ""),
    attemptId: String(path.attemptId ?? ""),
    projectId: String(path.projectId ?? ""),
    projectSlug: String(path.projectSlug ?? ""),
    projectTitle: String(path.projectTitle ?? ""),
    status: path.status === "completed" ? "completed" : "active",
    items: asArray(path.items).map(remediationItem),
    summary: String(path.summary ?? ""),
    explanation: String(path.explanation ?? ""),
    startedAt: String(path.startedAt ?? ""),
    completedAt: String(path.completedAt ?? ""),
    createdAt: String(path.createdAt ?? ""),
    updatedAt: String(path.updatedAt ?? ""),
  };
}

/** 获取补课路径列表；传入 projectSlug 时服务端会按最近一次失败评审懒生成并返回该项目的路径。 */
export function apiRemediationPaths(projectSlug?: string): Promise<RemediationPathRecord[]> {
  const query = projectSlug ? `?projectSlug=${encodeURIComponent(projectSlug)}` : "";
  return request<unknown>(`/api/remediation${query}`).then((data) => asArray(data).map(remediationPathRecord));
}

/** 获取单条补课路径（实时完成状态）。 */
export function apiRemediationPath(id: string): Promise<RemediationPathRecord> {
  return request<unknown>(`/api/remediation/${encodeURIComponent(id)}`).then(remediationPathRecord);
}

/** 完成补课：全部项完成后更新项目 mastery/status。 */
export function apiCompleteRemediationPath(id: string): Promise<RemediationPathRecord> {
  return request<unknown>(`/api/remediation/${encodeURIComponent(id)}/complete`, { method: "POST" }).then(remediationPathRecord);
}

// —— 选型实验 ——
export function apiChoiceScenarios(): Promise<ChoiceScenario[]> {
  return request<unknown>("/api/choicelab").then((data) =>
    asArray(asRecord(data).scenarios).map((item) => {
      const scenario = asRecord(item);
      return {
        id: String(scenario.id ?? ""),
        title: String(scenario.title ?? "未命名场景"),
        description: String(scenario.description ?? scenario.scenario ?? ""),
        options: asArray(scenario.options).map(String),
      };
    }),
  );
}
export async function apiChoiceScenario(id: string): Promise<ChoiceScenario> {
  const scenarios = await apiChoiceScenarios();
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new ApiError("场景不存在", 404);
  return scenario;
}
export function apiSubmitChoice(id: string, selectedOption: string, rationale: string): Promise<ChoiceSubmissionResult> {
  return request<ChoiceSubmissionResult>(`/api/choicelab/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: { selectedOption, rationale },
  });
}
