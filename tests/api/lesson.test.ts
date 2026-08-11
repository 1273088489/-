import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.resetModules();
});

describe("curriculum lesson APIs", () => {
  it("returns the seven-lesson path and public exercise evidence without solutions", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-lesson-api-test-"));
    const databasePath = path.join(temporaryDirectory, "api.db");
    const previousDatabasePath = process.env.DB_PATH;
    const migrationDatabase = new Database(databasePath);
    applyMigrations(migrationDatabase);
    migrationDatabase.close();
    process.env.DB_PATH = databasePath;
    vi.resetModules();
    vi.doMock("@/server/auth/session", () => ({
      getSessionUser: vi.fn().mockResolvedValue({ id: "learner-1" }),
    }));

    let sqlite: Database.Database | undefined;
    try {
      const { db, seedCurriculum } = await import("@/server/curriculum/service");
      const { exercises, users } = await import("@/server/db/schema");
      ({ sqlite } = await import("@/server/db/client"));
      await seedCurriculum();
      db.insert(users).values({
        id: "learner-1",
        email: "learner@example.com",
        name: "学习者",
        passwordHash: "hash",
      }).run();

      const { GET: getCourse } = await import("@/app/api/course/[slug]/route");
      const courseResponse = await getCourse(
        new NextRequest("http://localhost/api/course/fullstack-ticket-system"),
        { params: Promise.resolve({ slug: "fullstack-ticket-system" }) },
      );
      const courseBody = await courseResponse.json();
      expect(courseBody.data.lessons.map((lesson: { slug: string }) => lesson.slug)).toEqual([
        "s1-dev-environment",
        "s2-vanilla-js",
        "s3-react",
        "s4-node-postgres",
        "s4-auth-authorization",
        "s4-testing-ci",
        "s4-docker-deployment",
      ]);

      const { GET: getLesson } = await import("@/app/api/lesson/[slug]/route");
      const lessonResponse = await getLesson(
        new NextRequest("http://localhost/api/lesson/s4-auth-authorization"),
        { params: Promise.resolve({ slug: "s4-auth-authorization" }) },
      );
      const lessonBody = await lessonResponse.json();
      expect(lessonBody.data).toMatchObject({
        slug: "s4-auth-authorization",
        contentMarkdown: expect.stringContaining("## 复盘与迁移"),
        exercises: [
          expect.objectContaining({ slug: "s4-auth-ex1-session-flow" }),
          expect.objectContaining({ slug: "s4-auth-ex2-owner-guard" }),
        ],
      });
      expect(JSON.stringify(lessonBody)).not.toContain("solution");

      const exercise = db
        .select()
        .from(exercises)
        .where(eq(exercises.slug, "s4-auth-ex1-session-flow"))
        .get();
      expect(exercise).toBeDefined();
      const { GET: getExercise } = await import("@/app/api/exercise/[id]/route");
      const exerciseResponse = await getExercise(
        new NextRequest(`http://localhost/api/exercise/${exercise!.id}`),
        { params: Promise.resolve({ id: exercise!.id }) },
      );
      const exerciseBody = await exerciseResponse.json();
      expect(exerciseBody.data).toMatchObject({
        slug: "s4-auth-ex1-session-flow",
        hints: expect.arrayContaining([expect.any(String), expect.any(String)]),
        rubric: expect.arrayContaining([expect.stringContaining("提交")]),
      });
      expect(JSON.stringify(exerciseBody)).not.toContain("solution");

      const { POST: submitExercise } = await import("@/app/api/exercise/[id]/submit/route");
      const submitResponse = await submitExercise(
        new NextRequest(`http://localhost/api/exercise/${exercise!.id}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer: "session token" }),
        }),
        { params: Promise.resolve({ id: exercise!.id }) },
      );
      const submitBody = await submitResponse.json();
      expect(submitResponse.status).toBe(200);
      const sessionCriterion = submitBody.data.rubricResults.find(
        (item: { criterion: string }) => item.criterion.includes("session token"),
      );
      expect(sessionCriterion).toMatchObject({ evidenceStatus: "unsupported" });
      expect(sessionCriterion.missingEvidence.length).toBeGreaterThan(0);
    } finally {
      if (sqlite?.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
