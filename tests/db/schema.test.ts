import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { courses, exercises, lessons, projectAttempts, repositorySubmissions, sandboxRuns, stageProjects, testCases, testRuns, users } from "@/server/db/schema";
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
        "evidence_fact",
        "exercise",
        "learning_record",
        "lesson",
        "project_attempt",
        "remediation_path",
        "repository_submission",
        "review_feedback",
        "sandbox_run",
        "session",
        "stage_project",
        "terminal_runtime",
        "test_case",
        "test_run",
        "user",
      ]);
      expect(indexes).toEqual(
        expect.arrayContaining([
          "course_slug_unique",
          "session_token_unique",
          "stage_project_slug_unique",
          "terminal_runtime_user_course_unique",
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

  it("persists repository_submission linked to a project attempt", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const user = orm.insert(users).values({ email: "repo@example.com", name: "仓库学习者", passwordHash: "hash" }).returning().get();
      const course = orm.insert(courses).values({ slug: "course-1", title: "课程", description: "desc" }).returning().get();
      const project = orm.insert(stageProjects).values({ courseId: course.id, slug: "p-repo", title: "仓库项目", description: "desc" }).returning().get();
      const attempt = orm.insert(projectAttempts).values({ userId: user.id, projectId: project.id }).returning().get();
      const submission = orm.insert(repositorySubmissions).values({
        attemptId: attempt.id,
        sourceType: "url",
        sourceUrl: "https://github.com/acme/repo.git",
        status: "parsed",
        snapshot: JSON.stringify({ tree: { fileCount: 1 } }),
      }).returning().get();

      expect(submission).toMatchObject({
        attemptId: attempt.id,
        sourceType: "url",
        sourceUrl: "https://github.com/acme/repo.git",
        archiveKind: "",
        status: "parsed",
        snapshot: JSON.stringify({ tree: { fileCount: 1 } }),
        error: "",
      });
      expect(submission.id).toMatch(/^[0-9a-f-]{36}$/);

      // attempt 删除时级联删除 repository_submission
      orm.delete(projectAttempts).where(eq(projectAttempts.id, attempt.id)).run();
      expect(orm.select().from(repositorySubmissions).all()).toHaveLength(0);

      expect(() =>
        orm.insert(repositorySubmissions).values({ attemptId: "missing-attempt", sourceType: "url" }).run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  it("persists sandbox_run linked to a project attempt and repository submission", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const user = orm.insert(users).values({ email: "sandbox@example.com", name: "沙箱学习者", passwordHash: "hash" }).returning().get();
      const course = orm.insert(courses).values({ slug: "course-2", title: "课程", description: "desc" }).returning().get();
      const project = orm.insert(stageProjects).values({ courseId: course.id, slug: "p-sandbox", title: "沙箱项目", description: "desc" }).returning().get();
      const attempt = orm.insert(projectAttempts).values({ userId: user.id, projectId: project.id }).returning().get();
      const submission = orm.insert(repositorySubmissions).values({
        attemptId: attempt.id,
        sourceType: "url",
        sourceUrl: "https://github.com/acme/repo.git",
        status: "parsed",
        snapshot: "{}",
      }).returning().get();
      const run = orm.insert(sandboxRuns).values({
        attemptId: attempt.id,
        repositorySubmissionId: submission.id,
        runtime: "node",
        status: "failed",
        errorCode: "runtime-error",
        exitCode: 1,
        stdout: "out",
        stderr: "err",
        phases: JSON.stringify([{ phase: "install", label: "安装依赖", exitCode: 1 }]),
        startedAt: "2026-08-12T00:00:00.000Z",
        finishedAt: "2026-08-12T00:00:01.000Z",
        durationMs: 1000,
        timedOut: false,
        oomKilled: false,
        message: "安装依赖失败",
      }).returning().get();

      expect(run).toMatchObject({
        attemptId: attempt.id,
        repositorySubmissionId: submission.id,
        runtime: "node",
        status: "failed",
        errorCode: "runtime-error",
        exitCode: 1,
        stdout: "out",
        stderr: "err",
        durationMs: 1000,
        timedOut: false,
        oomKilled: false,
        message: "安装依赖失败",
      });
      expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.parse(run.phases)).toHaveLength(1);

      // attempt 删除时级联删除 sandbox_run
      orm.delete(projectAttempts).where(eq(projectAttempts.id, attempt.id)).run();
      expect(orm.select().from(sandboxRuns).all()).toHaveLength(0);

      expect(() =>
        orm.insert(sandboxRuns).values({ attemptId: "missing-attempt", repositorySubmissionId: "missing-repo" }).run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  it("defaults sandbox_config on stage_project and refreshes via seed-shaped inserts", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const course = orm.insert(courses).values({ slug: "course-3", title: "课程", description: "desc" }).returning().get();
      const project = orm.insert(stageProjects).values({ courseId: course.id, slug: "p-sandbox-config", title: "配置项目", description: "desc" }).returning().get();
      expect(project.sandboxConfig).toBe("{}");
    });
  });

  it("persists test_case/test_run linked to project, sandbox run and attempt (P2-04)", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const user = orm.insert(users).values({ email: "test@example.com", name: "测试学习者", passwordHash: "hash" }).returning().get();
      const course = orm.insert(courses).values({ slug: "course-p2-04", title: "课程", description: "desc" }).returning().get();
      const project = orm.insert(stageProjects).values({ courseId: course.id, slug: "p-tests", title: "测试项目", description: "desc" }).returning().get();
      const testCase = orm.insert(testCases).values({
        projectId: project.id,
        key: "public-1",
        kind: "public",
        name: "公开检查",
        framework: "static-check",
        files: JSON.stringify({ "check.mjs": "console.log('ok')" }),
        command: "[]",
        orderIndex: 0,
      }).returning().get();
      expect(testCase).toMatchObject({ projectId: project.id, kind: "public", framework: "static-check" });
      // 同一项目 key 唯一
      expect(() =>
        orm.insert(testCases).values({ projectId: project.id, key: "public-1", kind: "public", name: "重复", framework: "static-check", files: "{}", command: "[]" }).run(),
      ).toThrow(/UNIQUE constraint failed/);

      const attempt = orm.insert(projectAttempts).values({ userId: user.id, projectId: project.id }).returning().get();
      const submission = orm.insert(repositorySubmissions).values({ attemptId: attempt.id, sourceType: "url", status: "parsed", snapshot: "{}" }).returning().get();
      const run = orm.insert(sandboxRuns).values({ kind: "hidden", attemptId: attempt.id, repositorySubmissionId: submission.id, runtime: "node", status: "success", phases: "[]" }).returning().get();
      expect(run.kind).toBe("hidden");

      const testRun = orm.insert(testRuns).values({
        sandboxRunId: run.id,
        testCaseId: testCase.id,
        attemptId: attempt.id,
        status: "passed",
        passed: true,
        durationMs: 42,
        message: "OK",
      }).returning().get();
      expect(testRun).toMatchObject({ passed: true, durationMs: 42, message: "OK" });

      // 删除 attempt 级联删除 sandbox_run 与 test_run
      orm.delete(projectAttempts).where(eq(projectAttempts.id, attempt.id)).run();
      expect(orm.select().from(sandboxRuns).all()).toHaveLength(0);
      expect(orm.select().from(testRuns).all()).toHaveLength(0);

      expect(() =>
        orm.insert(testRuns).values({ sandboxRunId: "missing", testCaseId: testCase.id, attemptId: "missing", status: "passed", passed: true }).run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  it("defaults sandbox_run.kind to main and sandbox_config to {}", () => {
    withMigratedDatabase((database) => {
      const orm = drizzle(database);
      const user = orm.insert(users).values({ email: "kind@example.com", name: "kind", passwordHash: "hash" }).returning().get();
      const course = orm.insert(courses).values({ slug: "course-kind", title: "课程", description: "desc" }).returning().get();
      const project = orm.insert(stageProjects).values({ courseId: course.id, slug: "p-kind", title: "项目", description: "desc" }).returning().get();
      const attempt = orm.insert(projectAttempts).values({ userId: user.id, projectId: project.id }).returning().get();
      const submission = orm.insert(repositorySubmissions).values({ attemptId: attempt.id, sourceType: "url", status: "parsed", snapshot: "{}" }).returning().get();
      const run = orm.insert(sandboxRuns).values({ attemptId: attempt.id, repositorySubmissionId: submission.id, runtime: "static", status: "success", phases: "[]" }).returning().get();
      expect(run.kind).toBe("main");
      expect(orm.select().from(stageProjects).where(eq(stageProjects.id, project.id)).get()!.sandboxConfig).toBe("{}");
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
