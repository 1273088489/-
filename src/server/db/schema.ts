import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
  createdAt: text("created_at").notNull().default(""),
});

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
}));
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  learningRecords: many(learningRecords),
}));

export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type StageProject = typeof stageProjects.$inferSelect;
