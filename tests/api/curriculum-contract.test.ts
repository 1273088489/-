import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

const forbiddenPublicKeys = new Set([
  "solution",
  "password",
  "passwordhash",
  "token",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "secret",
]);

function expectExactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([...keys].sort());
}

function expectNoSensitiveKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoSensitiveKeys);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    expect(forbiddenPublicKeys, `public response exposes ${key}`).not.toContain(key.toLocaleLowerCase());
    expectNoSensitiveKeys(nested);
  }
}

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.resetModules();
});

describe("public curriculum API contract", () => {
  it("enforces authentication, stable shapes, missing resources, and solution secrecy", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-api-contract-"));
    const databasePath = path.join(temporaryDirectory, "api.db");
    const previousDatabasePath = process.env.DB_PATH;
    const migrationDatabase = new Database(databasePath);
    applyMigrations(migrationDatabase);
    migrationDatabase.close();
    process.env.DB_PATH = databasePath;
    vi.resetModules();

    const getSessionUser = vi.fn().mockResolvedValue({ id: "learner-1" });
    vi.doMock("@/server/auth/session", () => ({ getSessionUser }));

    let sqlite: Database.Database | undefined;
    try {
      const { db, seedCurriculum } = await import("@/server/curriculum/service");
      const { exercises } = await import("@/server/db/schema");
      ({ sqlite } = await import("@/server/db/client"));
      await seedCurriculum();

      const [{ GET: getCourses }, { GET: getCourse }, { GET: getLesson }, { GET: getExercise }, { GET: getProject }] =
        await Promise.all([
          import("@/app/api/course/route"),
          import("@/app/api/course/[slug]/route"),
          import("@/app/api/lesson/[slug]/route"),
          import("@/app/api/exercise/[id]/route"),
          import("@/app/api/project/[slug]/route"),
        ]);
      const exercise = db.select().from(exercises).where(eq(exercises.slug, "s1-ex1-git-commit")).get();
      expect(exercise).toBeDefined();

      const successCalls = [
        () => getCourses(new NextRequest("http://localhost/api/course")),
        () => getCourse(new NextRequest("http://localhost/api/course/fullstack-ticket-system"), {
          params: Promise.resolve({ slug: "fullstack-ticket-system" }),
        }),
        () => getLesson(new NextRequest("http://localhost/api/lesson/s1-dev-environment"), {
          params: Promise.resolve({ slug: "s1-dev-environment" }),
        }),
        () => getExercise(new NextRequest(`http://localhost/api/exercise/${exercise!.id}`), {
          params: Promise.resolve({ id: exercise!.id }),
        }),
        () => getProject(new NextRequest("http://localhost/api/project/p1-static-page"), {
          params: Promise.resolve({ slug: "p1-static-page" }),
        }),
      ];
      const successBodies = [];
      for (const call of successCalls) {
        const response = await call();
        expect(response.status).toBe(200);
        const body = await response.json();
        expectExactKeys(body, ["ok", "data"]);
        expect(body.ok).toBe(true);
        expectNoSensitiveKeys(body);
        successBodies.push(body.data);
      }

      const courseList = successBodies[0] as unknown[];
      expect(courseList).toHaveLength(1);
      expectExactKeys(courseList[0], ["slug", "title", "description", "progress", "lessonCount", "projectCount"]);
      expect(courseList[0]).toEqual({
        slug: "fullstack-ticket-system",
        title: expect.any(String),
        description: expect.any(String),
        progress: expect.any(Number),
        lessonCount: 7,
        projectCount: 4,
      });

      const course = successBodies[1];
      expectExactKeys(course, ["slug", "title", "description", "orderIndex", "progress", "lessons", "projects"]);
      expect(course.slug).toBe("fullstack-ticket-system");
      expect(course.lessons).toHaveLength(7);
      expect(course.projects).toHaveLength(4);
      for (const lesson of course.lessons as unknown[]) {
        expectExactKeys(lesson, ["slug", "title", "orderIndex", "requiresPass", "status", "mastery"]);
      }
      for (const project of course.projects as unknown[]) {
        expectExactKeys(project, ["slug", "title", "description", "orderIndex", "status", "mastery"]);
      }

      const lesson = successBodies[2];
      expectExactKeys(lesson, [
        "id", "slug", "title", "orderIndex", "contentMarkdown", "requiresPass", "courseSlug",
        "courseTitle", "status", "mastery", "exercises", "prevLessonSlug", "nextLessonSlug",
      ]);
      expect(lesson.slug).toBe("s1-dev-environment");
      expect(lesson.contentMarkdown).toContain("## 学习目标");
      for (const summary of lesson.exercises as unknown[]) {
        expectExactKeys(summary, ["id", "slug", "prompt", "answerType", "status", "mastery"]);
      }

      const exerciseDetail = successBodies[3];
      expectExactKeys(exerciseDetail, [
        "id", "slug", "prompt", "answerType", "status", "mastery", "hints", "rubric", "choices",
        "courseSlug", "courseTitle", "lessonSlug", "lessonTitle",
      ]);
      expect(exerciseDetail.slug).toBe("s1-ex1-git-commit");
      expect(exerciseDetail.hints).toEqual(expect.any(Array));
      expect(exerciseDetail.rubric).toEqual(expect.any(Array));
      expect(exerciseDetail.choices).toEqual(expect.any(Array));

      const projectDetail = successBodies[4];
      expectExactKeys(projectDetail, [
        "id", "slug", "title", "description", "orderIndex", "tasks", "acceptanceCriteria", "guideMarkdown",
        "deliverables", "rubric", "reflectionQuestions", "courseSlug", "courseTitle", "status", "mastery",
        "latestAttempt", "latestRepository", "latestSandboxRun", "publicTests", "publicTestRuns", "feedback",
      ]);
      expect(projectDetail.slug).toBe("p1-static-page");
      expect(projectDetail.guideMarkdown).toContain("# 项目指南");
      expect(projectDetail.latestAttempt).toBeNull();
      expect(projectDetail.feedback).toBeNull();
      for (const criterion of projectDetail.rubric as unknown[]) {
        expectExactKeys(criterion, ["id", "criterion", "weight", "evidence", "levels"]);
        expectExactKeys(criterion.levels, ["excellent", "competent", "developing", "missing"]);
      }

      const missingCalls = [
        () => getCourse(new NextRequest("http://localhost/api/course/missing"), {
          params: Promise.resolve({ slug: "missing" }),
        }),
        () => getLesson(new NextRequest("http://localhost/api/lesson/missing"), {
          params: Promise.resolve({ slug: "missing" }),
        }),
        () => getExercise(new NextRequest("http://localhost/api/exercise/missing"), {
          params: Promise.resolve({ id: "missing" }),
        }),
        () => getProject(new NextRequest("http://localhost/api/project/missing"), {
          params: Promise.resolve({ slug: "missing" }),
        }),
      ];
      for (const call of missingCalls) {
        const response = await call();
        expect(response.status).toBe(404);
        const body = await response.json();
        expectExactKeys(body, ["ok", "error"]);
        expect(body).toEqual({ ok: false, error: expect.any(String) });
      }

      getSessionUser.mockResolvedValue(null);
      for (const call of successCalls) {
        const response = await call();
        expect(response.status).toBe(401);
        const body = await response.json();
        expectExactKeys(body, ["ok", "error"]);
        expect(body).toEqual({ ok: false, error: "未登录" });
      }
    } finally {
      if (sqlite?.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
