import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { courses, exercises, lessons, stageProjects, users } from "@/server/db/schema";
import { applyMigrations } from "../helpers/ddl";

function withMigratedDatabase(run: (database: Database.Database) => void): void {
  const database = new Database(":memory:");
  try {
    applyMigrations(database);
    run(database);
  } finally {
    database.close();
  }
}

describe("generated SQL migrations", () => {
  it("creates every MVP table and unique index", () => {
    withMigratedDatabase((database) => {
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      const indexes = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toEqual([
        "choice_lab",
        "course",
        "exercise",
        "learning_record",
        "lesson",
        "project_attempt",
        "review_feedback",
        "session",
        "stage_project",
        "user",
      ]);
      expect(indexes).toEqual(
        expect.arrayContaining([
          "course_slug_unique",
          "session_token_unique",
          "stage_project_slug_unique",
          "user_email_unique",
        ]),
      );
    });
  });

  it("accepts the curriculum graph through the public Drizzle schema", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const course = orm
        .insert(courses)
        .values({ slug: "fullstack-ticket-system", title: "全栈工单管理系统", description: "从零到上线" })
        .returning()
        .get();
      const lesson = orm
        .insert(lessons)
        .values({ courseId: course.id, slug: "s1-dev-environment", title: "阶段 1：开发环境" })
        .returning()
        .get();
      const exercise = orm
        .insert(exercises)
        .values({ lessonId: lesson.id, slug: "s1-ex1", prompt: "描述一个命令" })
        .returning()
        .get();
      const project = orm
        .insert(stageProjects)
        .values({
          courseId: course.id,
          slug: "p1-static-page",
          title: "发布静态主页",
          description: "走通最小闭环",
        })
        .returning()
        .get();

      expect(course.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Date.parse(course.createdAt)).not.toBeNaN();
      expect(course.orderIndex).toBe(0);
      expect(lesson).toMatchObject({ courseId: course.id, contentMarkdown: "", requiresPass: true });
      expect(exercise).toMatchObject({ lessonId: lesson.id, answerType: "text", hints: "[]" });
      expect(project).toMatchObject({ courseId: course.id, tasks: "[]", orderIndex: 0 });
    });
  });

  it("enforces unique business identifiers and foreign keys", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      orm.insert(users).values({ email: "learner@example.com", name: "学习者", passwordHash: "hash" }).run();

      expect(() =>
        orm.insert(users).values({ email: "learner@example.com", name: "另一位学习者", passwordHash: "hash" }).run(),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() =>
        orm.insert(lessons).values({ courseId: "missing-course", slug: "orphan", title: "孤立课时" }).run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });
  });
});
