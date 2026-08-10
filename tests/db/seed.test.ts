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
    await withSeedDatabase(async ({ db, seedCurriculum }, { courses, lessons, exercises, stageProjects }) => {
      await seedCurriculum();
      const countRows = () => ({
        courses: db.select().from(courses).all().length,
        lessons: db.select().from(lessons).all().length,
        exercises: db.select().from(exercises).all().length,
        projects: db.select().from(stageProjects).all().length,
      });
      const firstCounts = countRows();

      await seedCurriculum();

      expect(countRows()).toEqual(firstCounts);
      expect(db.select().from(courses).where(eq(courses.slug, "fullstack-ticket-system")).all()).toHaveLength(1);
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
