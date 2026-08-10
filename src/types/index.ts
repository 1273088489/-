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
}

// —— 项目 ——
export interface ProjectDetail {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  tasks: string[];
  acceptanceCriteria: string[];
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
  attempt?: {
    id: string;
    status: string;
    submittedAt: string;
  };
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
