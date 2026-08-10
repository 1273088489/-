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
  ReviewResult,
  Session,
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
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
      status: project.status ?? "not_started",
      mastery: Number(project.mastery ?? 0),
      latestAttempt: project.latestAttempt ?? null,
      feedback: feedback
        ? {
            score: Number(feedback.score ?? 0),
            summary: String(feedback.summary ?? ""),
            checklist: asArray(feedback.checklist),
            suggestions: asArray(feedback.suggestions).map(String),
            provider: String(feedback.provider ?? "unknown"),
          }
        : null,
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
