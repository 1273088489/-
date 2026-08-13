import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

type SeedService = typeof import("@/server/curriculum/service");
type Schema = typeof import("@/server/db/schema");

async function withSeedDatabase(run: (service: SeedService, schema: Schema) => Promise<void>): Promise<void> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-seed-test-"));
  const databasePath = path.join(temporaryDirectory, "seed.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();

  process.env.DB_PATH = databasePath;
  vi.resetModules();

  let sqlite: Database.Database | undefined;
  try {
    const service = await import("@/server/curriculum/service");
    const schema = await import("@/server/db/schema");
    ({ sqlite } = await import("@/server/db/client"));
    await run(service, schema);
  } finally {
    if (sqlite?.open) sqlite.close();
    vi.resetModules();
    if (previousDatabasePath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDatabasePath;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("seedCurriculum", () => {
  it("seeds queryable courses, lessons, exercises, and projects", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { courses, lessons, exercises, stageProjects }) => {
      const result = await seedCurriculum();
      const courseRows = db.select().from(courses).all();

      expect(result.courses).toBeGreaterThan(0);
      expect(courseRows[0]).toMatchObject({ slug: "fullstack-ticket-system" });
      expect(db.select().from(lessons).all().length).toBeGreaterThan(0);
      expect(db.select().from(exercises).all().length).toBeGreaterThan(0);
      expect(db.select().from(stageProjects).all().length).toBeGreaterThan(0);
    });
  });

  it("is idempotent when run repeatedly", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { courses, lessons, exercises, stageProjects, testCases }) => {
      await seedCurriculum();
      const countRows = () => ({
        courses: db.select().from(courses).all().length,
        lessons: db.select().from(lessons).all().length,
        exercises: db.select().from(exercises).all().length,
        projects: db.select().from(stageProjects).all().length,
        testCases: db.select().from(testCases).all().length,
      });
      const firstCounts = countRows();

      expect(firstCounts).toEqual({ courses: 1, lessons: 7, exercises: 15, projects: 4, testCases: 13 });

      await seedCurriculum();

      expect(countRows()).toEqual(firstCounts);
      expect(db.select().from(courses).where(eq(courses.slug, "fullstack-ticket-system")).all()).toHaveLength(1);
    });
  });

  it("refreshes stale lesson and exercise contracts without creating duplicates", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { lessons, exercises }) => {
      await seedCurriculum();
      const lesson = db.select().from(lessons).where(eq(lessons.slug, "s1-dev-environment")).get();
      const exercise = db.select().from(exercises).where(eq(exercises.slug, "s1-ex2-path")).get();
      expect(lesson).toBeDefined();
      expect(exercise).toBeDefined();

      db.update(lessons)
        .set({ title: "stale", contentMarkdown: "stale", requiresPass: false })
        .where(eq(lessons.id, lesson!.id))
        .run();
      db.update(exercises)
        .set({ prompt: "stale", hints: "[]", rubric: "[]", solution: "stale" })
        .where(eq(exercises.id, exercise!.id))
        .run();

      await seedCurriculum();

      expect(db.select().from(lessons).where(eq(lessons.slug, lesson!.slug)).get()).toMatchObject({
        id: lesson!.id,
        title: expect.not.stringMatching(/^stale$/),
        contentMarkdown: expect.stringContaining("## 学习目标"),
        requiresPass: true,
      });
      expect(db.select().from(exercises).where(eq(exercises.slug, exercise!.slug)).get()).toMatchObject({
        id: exercise!.id,
        prompt: expect.stringContaining("提交"),
        hints: expect.not.stringMatching(/^\[\]$/),
        rubric: expect.not.stringMatching(/^\[\]$/),
        solution: expect.not.stringMatching(/^stale$/),
      });
      expect(db.select().from(lessons).all()).toHaveLength(7);
      expect(db.select().from(exercises).all()).toHaveLength(15);
    });
  });

  it("persists and refreshes the stage project teaching contract", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { stageProjects }) => {
      await seedCurriculum();
      const readProject = (slug = "p1-static-page") =>
        db.select().from(stageProjects).where(eq(stageProjects.slug, slug)).get();

      expect(readProject()).toMatchObject({
        guideMarkdown: expect.stringContaining("# 项目指南"),
        deliverables: JSON.stringify(["静态项目说明页源码仓库", "最小 PRD 与需求基线", "包含本地运行说明的 README", "发布地址与提交记录"]),
      });
      expect(JSON.parse(readProject()!.rubric)).toHaveLength(3);
      expect(JSON.parse(readProject()!.reflectionQuestions)).toHaveLength(2);
      expect(readProject("p2-vanilla-board")?.guideMarkdown).toContain("旧 localStorage 数据迁移");
      expect(JSON.parse(readProject("p2-vanilla-board")!.deliverables)).toContain("需求变更与编码前影响分析");
      expect(readProject("p3-react-board")?.guideMarkdown).toContain("## ADR 模板");
      expect(readProject("p4-fullstack-board")?.guideMarkdown).toContain("## Mermaid ER 图模板");
      expect(JSON.parse(readProject("p4-fullstack-board")!.deliverables)).toEqual(expect.arrayContaining([
        "OpenAPI 风格 API 契约",
        "部署与回滚记录",
      ]));

      db.update(stageProjects)
        .set({ guideMarkdown: "stale", deliverables: "[]", rubric: "[]", reflectionQuestions: "[]" })
        .where(eq(stageProjects.slug, "p1-static-page"))
        .run();
      await seedCurriculum();

      expect(readProject()).toMatchObject({
        guideMarkdown: expect.stringContaining("# 项目指南"),
        deliverables: JSON.stringify(["静态项目说明页源码仓库", "最小 PRD 与需求基线", "包含本地运行说明的 README", "发布地址与提交记录"]),
      });
      expect(JSON.parse(readProject()!.rubric)).toHaveLength(3);
      expect(JSON.parse(readProject()!.reflectionQuestions)).toHaveLength(2);
      expect(db.select().from(stageProjects).all()).toHaveLength(4);
    });
  });

  it("persists the complete seven-lesson learning path and its exercises", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { lessons, exercises }) => {
      await seedCurriculum();

      expect(
        db
          .select()
          .from(lessons)
          .all()
          .sort((left, right) => left.orderIndex - right.orderIndex)
          .map((lesson) => lesson.slug),
      ).toEqual([
        "s1-dev-environment",
        "s2-vanilla-js",
        "s3-react",
        "s4-node-postgres",
        "s4-auth-authorization",
        "s4-testing-ci",
        "s4-docker-deployment",
      ]);
      expect(db.select().from(exercises).all()).toHaveLength(15);

      const authLesson = db.select().from(lessons).where(eq(lessons.slug, "s4-auth-authorization")).get();
      expect(authLesson?.title).toContain("第四阶段第 2 课");
      expect(authLesson?.contentMarkdown).toContain("## 常见错误与诊断");
      expect(
        db
          .select()
          .from(exercises)
          .all()
          .filter((exercise) => exercise.lessonId === authLesson?.id)
          .map((exercise) => exercise.slug),
      ).toEqual(["s4-auth-ex1-session-flow", "s4-auth-ex2-owner-guard"]);
    });
  });

  it("seeds public and hidden test cases per project (P2-04) without exposing hidden defs", async () => {
    await withSeedDatabase(async ({ db, seedCurriculum }, { testCases, stageProjects }) => {
      await seedCurriculum();

      const all = db.select().from(testCases).all();
      expect(all).toHaveLength(13);
      expect(all.filter((c) => c.kind === "public").length).toBeGreaterThan(0);
      expect(all.filter((c) => c.kind === "hidden").length).toBeGreaterThan(0);

      const p1 = db.select().from(stageProjects).where(eq(stageProjects.slug, "p1-static-page")).get()!;
      const p1Cases = db.select().from(testCases).where(eq(testCases.projectId, p1.id)).all();
      expect(p1Cases.map((c) => c.kind).sort()).toEqual(["hidden", "public"]);
      expect(p1Cases.find((c) => c.kind === "hidden")!.files).toContain("ticket-prd");

      // 幂等：重复 seed 不产生重复 test_case
      await seedCurriculum();
      expect(db.select().from(testCases).all()).toHaveLength(13);
    });
  });

  it("ensureSeeded preserves an already seeded database", async () => {
    await withSeedDatabase(async ({ db, ensureSeeded, seedCurriculum }, { courses }) => {
      await seedCurriculum();
      const before = db.select().from(courses).all();

      const result = await ensureSeeded();

      expect(result.courses).toBe(before.length);
      expect(db.select().from(courses).all()).toEqual(before);
    });
  });
});
