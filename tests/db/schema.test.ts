import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
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
  it("upgrades existing projects with safe teaching-contract defaults", () => {
    const database = new Database(":memory:");
    const migrationsDirectory = path.resolve(import.meta.dirname, "../../drizzle");
    const migrationFiles = fs
      .readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));

    try {
      database.pragma("foreign_keys = ON");
      database.exec(fs.readFileSync(path.join(migrationsDirectory, migrationFiles[0]), "utf8"));
      database
        .prepare(
          "INSERT INTO course (id, slug, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("course-1", "fullstack-ticket-system", "全栈工单管理系统", "从零到上线", "2026-08-10", "2026-08-10");
      database
        .prepare(
          "INSERT INTO stage_project (id, course_id, slug, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("project-1", "course-1", "p1-static-page", "发布静态主页", "走通最小闭环", "2026-08-10", "2026-08-10");

      for (const migrationFile of migrationFiles.slice(1)) {
        database.exec(fs.readFileSync(path.join(migrationsDirectory, migrationFile), "utf8"));
      }

      expect(database.prepare("SELECT * FROM stage_project WHERE id = ?").get("project-1")).toMatchObject({
        id: "project-1",
        guide_markdown: "",
        deliverables: "[]",
        rubric: "[]",
        reflection_questions: "[]",
      });
    } finally {
      database.close();
    }
  });

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
      expect(project).toMatchObject({
        courseId: course.id,
        tasks: "[]",
        guideMarkdown: "",
        deliverables: "[]",
        rubric: "[]",
        reflectionQuestions: "[]",
        orderIndex: 0,
      });
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
