import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => randomUUID());

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const users = sqliteTable("user", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

export const sessions = sqliteTable("session", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Curriculum
// ---------------------------------------------------------------------------
export const courses = sqliteTable("course", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  ...timestamps,
});

export const lessons = sqliteTable("lesson", {
  id: id(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  contentMarkdown: text("content_markdown").notNull().default(""),
  requiresPass: integer("requires_pass", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const exercises = sqliteTable("exercise", {
  id: id(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  prompt: text("prompt").notNull(),
  hints: text("hints").notNull().default("[]"), // JSON string[]
  solution: text("solution").notNull().default(""),
  rubric: text("rubric").notNull().default("[]"), // JSON array
  answerType: text("answer_type").notNull().default("text"), // choices|code|text
  choices: text("choices").notNull().default("[]"), // JSON array for choices
  ...timestamps,
});

export const stageProjects = sqliteTable("stage_project", {
  id: id(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  tasks: text("tasks").notNull().default("[]"), // JSON array
  acceptanceCriteria: text("acceptance_criteria").notNull().default("[]"), // JSON array
  guideMarkdown: text("guide_markdown").notNull().default(""),
  deliverables: text("deliverables").notNull().default("[]"), // JSON string[]
  rubric: text("rubric").notNull().default("[]"), // JSON ProjectRubricCriterion[]
  reflectionQuestions: text("reflection_questions").notNull().default("[]"), // JSON string[]
  sandboxConfig: text("sandbox_config").notNull().default("{}"), // JSON ProjectSandboxConfig
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Learning state
// ---------------------------------------------------------------------------
export const learningRecords = sqliteTable("learning_record", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contentId: text("content_id").notNull(),
  contentType: text("content_type").notNull(), // lesson|exercise|project
  status: text("status").notNull().default("not_started"), // not_started|in_progress|completed|needs_review
  mastery: integer("mastery").notNull().default(0),
  errorHistory: text("error_history").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(""),
});

export const projectAttempts = sqliteTable("project_attempt", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => stageProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull().default(""),
  status: text("status").notNull().default("submitted"), // submitted|reviewed
  submittedAt: text("submitted_at").notNull().default(""),
  ...timestamps,
});


export const repositorySubmissions = sqliteTable("repository_submission", {
  id: id(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // url | archive
  sourceUrl: text("source_url").notNull().default(""),
  archiveName: text("archive_name").notNull().default(""),
  archiveKind: text("archive_kind").notNull().default(""), // zip | tar.gz
  status: text("status").notNull().default("parsed"), // parsed | failed
  snapshot: text("snapshot").notNull().default("{}"), // JSON RepoSnapshot
  error: text("error").notNull().default(""),
  ...timestamps,
});

export const sandboxRuns = sqliteTable("sandbox_run", {
  id: id(),
  /** 运行用途：main=主执行（P2-03），public=公开测试用例，hidden=隐藏测试用例（服务端专用）。 */
  kind: text("kind").notNull().default("main"), // main | public | hidden
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  repositorySubmissionId: text("repository_submission_id")
    .notNull()
    .references(() => repositorySubmissions.id, { onDelete: "cascade" }),
  runtime: text("runtime").notNull().default("node"), // node | static
  status: text("status").notNull().default("success"), // success | failed
  errorCode: text("error_code").notNull().default(""), // timeout|oom|network-blocked|runtime-error|infra-unavailable
  exitCode: integer("exit_code"),
  stdout: text("stdout").notNull().default(""),
  stderr: text("stderr").notNull().default(""),
  phases: text("phases").notNull().default("[]"), // JSON SandboxPhaseResult[]
  startedAt: text("started_at").notNull().default(""),
  finishedAt: text("finished_at").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  timedOut: integer("timed_out", { mode: "boolean" }).notNull().default(false),
  oomKilled: integer("oom_killed", { mode: "boolean" }).notNull().default(false),
  message: text("message").notNull().default(""),
  ...timestamps,
});

export const testCases = sqliteTable(
  "test_case",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => stageProjects.id, { onDelete: "cascade" }),
    /** 课程数据中的稳定标识（同一项目内唯一）。 */
    key: text("key").notNull(),
    kind: text("kind").notNull(), // public | hidden（hidden 仅服务端使用）
    name: text("name").notNull(),
    framework: text("framework").notNull().default("node:test"), // node:test | vitest | jest | static-check
    files: text("files").notNull().default("{}"), // JSON Record<path, content>
    command: text("command").notNull().default("[]"), // JSON string[]（argv）
    orderIndex: integer("order_index").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("test_case_project_key_unique").on(table.projectId, table.key)],
);

export const testRuns = sqliteTable("test_run", {
  id: id(),
  sandboxRunId: text("sandbox_run_id")
    .notNull()
    .references(() => sandboxRuns.id, { onDelete: "cascade" }),
  testCaseId: text("test_case_id")
    .notNull()
    .references(() => testCases.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("passed"), // passed | failed | error | skipped
  passed: integer("passed", { mode: "boolean" }).notNull().default(false),
  durationMs: integer("duration_ms").notNull().default(0),
  message: text("message").notNull().default(""),
  stdout: text("stdout").notNull().default(""),
  stderr: text("stderr").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});


export const evidenceFacts = sqliteTable("evidence_fact", {
  id: id(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  /** 证据来源类型：git_diff | test_output | file_content | runtime。 */
  sourceType: text("source_type").notNull(),
  /** 证据标题（人类可读）。 */
  label: text("label").notNull(),
  /** 证据详情（内容摘要/断言/运行信息；长度受限）。 */
  detail: text("detail").notNull().default(""),
  /** 结构化引用，如 file:README.md / test:p1-public-page-content / run:<id>。 */
  ref: text("ref").notNull().default(""),
  /** 隐藏测试等仅服务端证据：true 时绝不进入公开 API/UI。 */
  internal: integer("internal", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(""),
});

export const reviewFeedbacks = sqliteTable("review_feedback", {
  id: id(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("mock"),
  score: integer("score").notNull().default(0),
  summary: text("summary").notNull().default(""),
  checklist: text("checklist").notNull().default("[]"),
  suggestions: text("suggestions").notNull().default("[]"),
  /** P2-05：证据化评分明细（JSON RubricReviewItem[] / AcceptanceReviewItem[] / EvidenceFact[]）。 */
  rubricResults: text("rubric_results").notNull().default("[]"),
  acceptanceResults: text("acceptance_results").notNull().default("[]"),
  evidenceFacts: text("evidence_facts").notNull().default("[]"),
  capabilityNote: text("capability_note").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});


export const remediationPaths = sqliteTable("remediation_path", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 触发补课的 project_attempt（P2-06）。 */
  attemptId: text("attempt_id")
    .notNull()
    .references(() => projectAttempts.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => stageProjects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // active | completed
  /** 输入摘要（JSON RemediationSource）：errorHistory / 测试失败分类 / rubric 低分维度。 */
  source: text("source").notNull().default("{}"),
  /** 有序补课项（JSON RemediationStoredItem[]：目标 lesson/exercise/project）。 */
  items: text("items").notNull().default("[]"),
  /** 规则引擎摘要 + AI 增强解释。 */
  explanation: text("explanation").notNull().default(""),
  startedAt: text("started_at").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
  ...timestamps,
});


export const terminalRuntimes = sqliteTable(
  "terminal_runtime",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseSlug: text("course_slug").notNull(),
    volumeName: text("volume_name").notNull(),
    containerName: text("container_name").notNull(),
    networkName: text("network_name").notNull(),
    containerId: text("container_id").notNull().default(""),
    containerAddress: text("container_address").notNull().default(""),
    workspaceInitializedAt: text("workspace_initialized_at").notNull().default(""),
    workspaceInitializationVersion: integer("workspace_initialization_version").notNull().default(0),
    lastActiveAt: text("last_active_at").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("terminal_runtime_user_course_unique").on(table.userId, table.courseSlug)],
);

export const choiceLabs = sqliteTable("choice_lab", {
  id: id(),
  scenarioId: text("scenario_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  selectedOption: text("selected_option").notNull().default(""),
  rationale: text("rationale").notNull().default(""),
  aiFeedback: text("ai_feedback").notNull().default(""),
  score: integer("score").notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const coursesRelations = relations(courses, ({ many }) => ({
  lessons: many(lessons),
  projects: many(stageProjects),
}));
export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  exercises: many(exercises),
}));
export const exercisesRelations = relations(exercises, ({ one }) => ({
  lesson: one(lessons, { fields: [exercises.lessonId], references: [lessons.id] }),
}));
export const stageProjectsRelations = relations(stageProjects, ({ one, many }) => ({
  course: one(courses, { fields: [stageProjects.courseId], references: [courses.id] }),
  attempts: many(projectAttempts),
}));
export const projectAttemptsRelations = relations(projectAttempts, ({ one, many }) => ({
  project: one(stageProjects, { fields: [projectAttempts.projectId], references: [stageProjects.id] }),
  feedbacks: many(reviewFeedbacks),
  repositorySubmissions: many(repositorySubmissions),
  sandboxRuns: many(sandboxRuns),
  evidenceFacts: many(evidenceFacts),
  remediationPaths: many(remediationPaths),
}));
export const repositorySubmissionsRelations = relations(repositorySubmissions, ({ one, many }) => ({
  attempt: one(projectAttempts, { fields: [repositorySubmissions.attemptId], references: [projectAttempts.id] }),
  sandboxRuns: many(sandboxRuns),
}));
export const sandboxRunsRelations = relations(sandboxRuns, ({ one, many }) => ({
  attempt: one(projectAttempts, { fields: [sandboxRuns.attemptId], references: [projectAttempts.id] }),
  repositorySubmission: one(repositorySubmissions, { fields: [sandboxRuns.repositorySubmissionId], references: [repositorySubmissions.id] }),
  testRuns: many(testRuns),
}));
export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  project: one(stageProjects, { fields: [testCases.projectId], references: [stageProjects.id] }),
  runs: many(testRuns),
}));
export const testRunsRelations = relations(testRuns, ({ one }) => ({
  sandboxRun: one(sandboxRuns, { fields: [testRuns.sandboxRunId], references: [sandboxRuns.id] }),
  testCase: one(testCases, { fields: [testRuns.testCaseId], references: [testCases.id] }),
  attempt: one(projectAttempts, { fields: [testRuns.attemptId], references: [projectAttempts.id] }),
}));
export const evidenceFactsRelations = relations(evidenceFacts, ({ one }) => ({
  attempt: one(projectAttempts, { fields: [evidenceFacts.attemptId], references: [projectAttempts.id] }),
}));

export const remediationPathsRelations = relations(remediationPaths, ({ one }) => ({
  user: one(users, { fields: [remediationPaths.userId], references: [users.id] }),
  attempt: one(projectAttempts, { fields: [remediationPaths.attemptId], references: [projectAttempts.id] }),
  project: one(stageProjects, { fields: [remediationPaths.projectId], references: [stageProjects.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  learningRecords: many(learningRecords),
  remediationPaths: many(remediationPaths),
  terminalRuntimes: many(terminalRuntimes),
}));

export type User = typeof users.$inferSelect;
export type RepositorySubmission = typeof repositorySubmissions.$inferSelect;
export type SandboxRun = typeof sandboxRuns.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type EvidenceFact = typeof evidenceFacts.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type StageProject = typeof stageProjects.$inferSelect;
export type RemediationPath = typeof remediationPaths.$inferSelect;
