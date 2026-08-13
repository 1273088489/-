// P2-05 证据化评分管线：真实 DB 上 runEvidenceScoring 持久化 evidence_fact（含 internal 隐藏证据），
// 公开投影过滤隐藏证据；AI provider 失败时不伪造评分。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

afterEach(() => {
  vi.doUnmock("@/server/ai");
  vi.doUnmock("@/server/runner/materialize");
  vi.resetModules();
});

async function setup() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-scoring-"));
  const databasePath = path.join(temporaryDirectory, "api.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();
  process.env.DB_PATH = databasePath;
  vi.resetModules();

  vi.doMock("@/server/runner/materialize", () => ({
    materializeRepository: async () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-scoring-materialize-"));
      fs.writeFileSync(path.join(projectDir, "README.md"), "# 工单系统\n本地运行命令：npm start\nPRD 记录范围、验收标准和被放弃方案\n");
      fs.writeFileSync(path.join(projectDir, "index.html"), "<h1>工单系统</h1><p>目标用户：客服</p>");
      return { projectDir, cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }) };
    },
  }));

  const { db, seedCurriculum } = await import("@/server/curriculum/service");
  const schema = await import("@/server/db/schema");
  const { sqlite } = await import("@/server/db/client");
  await seedCurriculum();
  db.insert(schema.users).values({ id: "learner-1", email: "learner@example.com", name: "学习者", passwordHash: "hash" }).run();

  const project = db.select().from(schema.stageProjects).where(eq(schema.stageProjects.slug, "p1-static-page")).get()!;
  const attempt = db
    .insert(schema.projectAttempts)
    .values({ userId: "learner-1", projectId: project.id, code: "", status: "submitted", submittedAt: new Date().toISOString() })
    .returning()
    .get();
  const repository = db
    .insert(schema.repositorySubmissions)
    .values({
      attemptId: attempt.id,
      sourceType: "url",
      sourceUrl: "https://github.com/acme/repo.git",
      status: "parsed",
      snapshot: JSON.stringify({
        source: { type: "url", url: "https://github.com/acme/repo.git" },
        head: null,
        branches: [],
        commits: [],
        diff: { baseRef: "empty", filesChanged: 2, insertions: 10, deletions: 0, files: [{ path: "README.md", status: "added", insertions: 6, deletions: 0 }, { path: "index.html", status: "added", insertions: 4, deletions: 0 }] },
        tree: { fileCount: 2, totalBytes: 100, largestFileBytes: 60, files: ["README.md", "index.html"] },
        analyzedAt: new Date().toISOString(),
      }),
      error: "",
    })
    .returning()
    .get();

  const mainRun = db
    .insert(schema.sandboxRuns)
    .values({
      kind: "main",
      attemptId: attempt.id,
      repositorySubmissionId: repository.id,
      runtime: "static",
      status: "success",
      errorCode: "",
      exitCode: 0,
      stdout: "STATIC_VERIFY files=2",
      stderr: "",
      phases: "[]",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 100,
      timedOut: false,
      oomKilled: false,
      message: "",
    })
    .returning()
    .get();

  const cases = db.select().from(schema.testCases).where(eq(schema.testCases.projectId, project.id)).all();
  for (const testCase of cases) {
    const runRow = db
      .insert(schema.sandboxRuns)
      .values({
        kind: testCase.kind as "public" | "hidden",
        attemptId: attempt.id,
        repositorySubmissionId: repository.id,
        runtime: "node",
        status: "success",
        errorCode: "",
        exitCode: 0,
        stdout: "OK: 全部检查通过",
        stderr: "",
        phases: "[]",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 10,
        timedOut: false,
        oomKilled: false,
        message: "",
      })
      .returning()
      .get();
    db.insert(schema.testRuns).values({
      sandboxRunId: runRow.id,
      testCaseId: testCase.id,
      attemptId: attempt.id,
      status: "passed",
      passed: true,
      durationMs: 10,
      message: "OK: 全部检查通过",
      stdout: "OK",
      stderr: "",
      createdAt: new Date().toISOString(),
    }).run();
  }

  const allTestRuns = db
    .select({ run: schema.testRuns, testCase: schema.testCases })
    .from(schema.testRuns)
    .innerJoin(schema.testCases, eq(schema.testRuns.testCaseId, schema.testCases.id))
    .where(eq(schema.testRuns.attemptId, attempt.id))
    .all();

  return {
    temporaryDirectory,
    previousDatabasePath,
    db,
    schema,
    sqlite,
    attempt,
    repository,
    mainRun,
    allTestRuns,
    cleanup: () => {
      if (sqlite.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

describe("runEvidenceScoring 证据化评分管线（P2-05）", () => {
  it("持久化 evidence_fact（含 internal 隐藏证据），公开投影不泄漏", async () => {
    const env = await setup();
    try {
      const reviewMock = vi.fn().mockResolvedValue({ score: 82, summary: "AI 评审", checklist: [], suggestions: [], provider: "test" });
      vi.doMock("@/server/ai", () => ({ getAiProvider: () => ({ name: "test", review: reviewMock }) }));

      const { runEvidenceScoring, listPublicEvidenceFactRecords } = await import("@/server/scoring");
      const project = env.db.select().from(env.schema.stageProjects).where(eq(env.schema.stageProjects.slug, "p1-static-page")).get()!;

      const result = await runEvidenceScoring({
        project: {
          title: project.title,
          description: project.description,
          acceptanceCriteria: JSON.parse(project.acceptanceCriteria),
          rubric: JSON.parse(project.rubric),
        },
        snapshot: JSON.parse(env.repository.snapshot),
        testRuns: env.allTestRuns,
        mainRun: env.mainRun,
        source: { type: "url", url: "https://github.com/acme/repo.git" },
        attemptId: env.attempt.id,
      });

      expect(reviewMock).toHaveBeenCalledTimes(1);
      expect(result.review.score).toBe(82);
      expect(result.review.rubricResults?.length).toBe(3);
      expect(result.review.capabilityNote).toContain("公开测试 1/1 通过");
      expect(result.review.capabilityNote).toContain("沙箱主执行：成功");

      // evidence_fact 落库：runtime/file_content/test_output/git_diff，且隐藏测试 internal
      const rows = env.db.select().from(env.schema.evidenceFacts).where(eq(env.schema.evidenceFacts.attemptId, env.attempt.id)).all();
      expect(rows.length).toBeGreaterThanOrEqual(4);
      const internal = rows.filter((row) => row.internal === true);
      expect(internal.length).toBe(1);
      expect(internal[0].sourceType).toBe("test_output");
      expect(internal[0].ref).toContain("hidden");

      // 公开投影：无 internal，无隐藏标识
      const publicRecords = listPublicEvidenceFactRecords(env.attempt.id);
      expect(publicRecords.some((record) => record.ref.includes("hidden"))).toBe(false);
      const serialized = JSON.stringify(publicRecords);
      expect(serialized).not.toContain("hidden");
      expect(serialized).not.toContain("README 与最小 PRD 基线完整");
    } finally {
      env.cleanup();
    }
  });

  it("AI provider 失败时抛错且不持久化证据（不伪造评分）", async () => {
    const env = await setup();
    try {
      vi.doMock("@/server/ai", () => ({
        getAiProvider: () => ({ name: "test", review: vi.fn().mockRejectedValue(new Error("AI_PROVIDER_TIMEOUT")) }),
      }));

      const { runEvidenceScoring } = await import("@/server/scoring");
      const project = env.db.select().from(env.schema.stageProjects).where(eq(env.schema.stageProjects.slug, "p1-static-page")).get()!;

      await expect(runEvidenceScoring({
        project: {
          title: project.title,
          description: project.description,
          acceptanceCriteria: JSON.parse(project.acceptanceCriteria),
          rubric: JSON.parse(project.rubric),
        },
        snapshot: JSON.parse(env.repository.snapshot),
        testRuns: env.allTestRuns,
        mainRun: env.mainRun,
        source: { type: "url", url: "https://github.com/acme/repo.git" },
        attemptId: env.attempt.id,
      })).rejects.toThrow();

      const rows = env.db.select().from(env.schema.evidenceFacts).where(eq(env.schema.evidenceFacts.attemptId, env.attempt.id)).all();
      expect(rows).toHaveLength(0);
    } finally {
      env.cleanup();
    }
  });
});
