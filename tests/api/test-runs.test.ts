// P2-04 API 集成：仓库提交后运行公开+隐藏测试并持久化 test_case/test_run；
// 公开结果返回给学习者，隐藏结果只落库、绝不进入任何公开 API 响应。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

const HIDDEN_MARKERS = ["p1-hidden-baseline-docs", "README 与最小 PRD 基线完整"];

function fakeOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runtime: "node",
    status: "success",
    exitCode: 0,
    stdout: "OK: 全部检查通过\n",
    stderr: "",
    durationMs: 321,
    timedOut: false,
    oomKilled: false,
    message: undefined,
    phases: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.doUnmock("@/server/ai");
  vi.doUnmock("@/server/repo/ingest");
  vi.doUnmock("@/server/runner");
  vi.doUnmock("@/server/runner/materialize");
  vi.resetModules();
});

async function setup() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-test-runs-"));
  const databasePath = path.join(temporaryDirectory, "api.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();
  process.env.DB_PATH = databasePath;
  vi.resetModules();

  const runProjectInSandbox = vi.fn(async (options: { config?: Record<string, unknown> }) => {
    // 测试用例运行：config 带有固定 test 命令；主运行（P2-03）：项目原始 sandbox 配置。
    if (Array.isArray(options.config?.test)) {
      return fakeOutcome({ runtime: "node", stdout: "OK: 全部检查通过\n", phases: [] });
    }
    return fakeOutcome({ runtime: "static", stdout: "STATIC_VERIFY files=2\n", phases: [{ phase: "verify", label: "静态文件校验", exitCode: 0, stdout: "STATIC_VERIFY files=2", stderr: "", durationMs: 100 }] });
  });
  const resolveProjectSandboxConfig = vi.fn((raw: unknown) => ({
    runtime: undefined,
    timeoutMs: 60_000,
    memoryMb: 512,
    env: {},
    ...(typeof raw === "object" && raw !== null ? raw : {}),
  }));
  vi.doMock("@/server/runner", () => ({ runProjectInSandbox, resolveProjectSandboxConfig }));
  vi.doMock("@/server/runner/materialize", () => ({
    materializeRepository: async () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-tests-materialize-"));
      fs.writeFileSync(path.join(projectDir, "index.html"), "<h1>工单系统</h1>\n");
      return { projectDir, cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }) };
    },
  }));
  vi.doMock("@/server/auth/session", () => ({
    getSessionUser: vi.fn().mockResolvedValue({ id: "learner-1" }),
  }));
  vi.doMock("@/server/ai", () => ({
    getAiProvider: () => ({ name: "test", review: vi.fn().mockResolvedValue({ score: 80, summary: "ok", checklist: [], suggestions: [], provider: "test" }) }),
  }));

  const { db, seedCurriculum } = await import("@/server/curriculum/service");
  const schema = await import("@/server/db/schema");
  const { sqlite } = await import("@/server/db/client");
  await seedCurriculum();
  db.insert(schema.users).values({ id: "learner-1", email: "learner@example.com", name: "学习者", passwordHash: "hash" }).run();

  return {
    temporaryDirectory,
    previousDatabasePath,
    db,
    schema,
    sqlite,
    runProjectInSandbox,
    cleanup: () => {
      if (sqlite.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

async function postSubmit(env: Awaited<ReturnType<typeof setup>>, slug = "p1-static-page") {
  const { POST } = await import("@/app/api/project/[slug]/submit/route");
  const context = { params: Promise.resolve({ slug }) };
  return POST(new NextRequest(`http://localhost/api/project/${slug}/submit`, {
    method: "POST",
    body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
    headers: { "content-type": "application/json" },
  }), context);
}

describe("POST /api/project/[slug]/submit 公开+隐藏测试（P2-04）", () => {
  it("持久化 test_case/test_run 与 kind=public/hidden 的 sandbox_run，公开结果可见、隐藏不泄漏", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn().mockResolvedValue({
        source: { type: "url", url: "https://github.com/acme/repo.git" },
        head: null, branches: [], commits: [],
        diff: { baseRef: "empty", filesChanged: 1, insertions: 1, deletions: 0, files: [] },
        tree: { fileCount: 1, totalBytes: 2, largestFileBytes: 2, files: ["index.html"] },
        analyzedAt: "2026-08-12T00:00:00.000Z",
      });
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));

      const response = await postSubmit(env);
      expect(response.status).toBe(200);
      const body = await response.json();
      const serialized = JSON.stringify(body);

      // 响应包含公开测试定义与结果
      expect(body.data.publicTests).toHaveLength(1);
      expect(body.data.publicTests[0].name).toContain("说明页包含名称");
      expect(body.data.testRuns).toHaveLength(1);
      expect(body.data.testRuns[0]).toMatchObject({ passed: true, status: "passed", framework: "static-check" });

      // 安全：响应中绝不出现隐藏测试标识/内容
      for (const marker of HIDDEN_MARKERS) {
        expect(serialized).not.toContain(marker);
      }
      expect(serialized).not.toContain("hidden");

      // test_case 行（p1 项目）：1 公开 + 1 隐藏
      const p1 = env.db.select().from(env.schema.stageProjects).where(eq(env.schema.stageProjects.slug, "p1-static-page")).get()!;
      const cases = env.db.select().from(env.schema.testCases).where(eq(env.schema.testCases.projectId, p1.id)).all();
      expect(cases).toHaveLength(2);
      expect(cases.map((c) => c.kind).sort()).toEqual(["hidden", "public"]);

      // sandbox_run 行：main + public + hidden 各 1
      const runs = env.db.select().from(env.schema.sandboxRuns).all();
      expect(runs.map((r) => r.kind).sort()).toEqual(["hidden", "main", "public"]);

      // test_run 行：2 条，公开/隐藏均已持久化
      const runsRows = env.db.select().from(env.schema.testRuns).all();
      expect(runsRows).toHaveLength(2);
      expect(runsRows.every((r) => r.passed === true)).toBe(true);
      const publicRun = env.db
        .select()
        .from(env.schema.testRuns)
        .innerJoin(env.schema.testCases, eq(env.schema.testRuns.testCaseId, env.schema.testCases.id))
        .where(eq(env.schema.testCases.kind, "public"))
        .all();
      const hiddenRun = env.db
        .select()
        .from(env.schema.testRuns)
        .innerJoin(env.schema.testCases, eq(env.schema.testRuns.testCaseId, env.schema.testCases.id))
        .where(eq(env.schema.testCases.kind, "hidden"))
        .all();
      expect(publicRun).toHaveLength(1);
      expect(hiddenRun).toHaveLength(1);
      expect(hiddenRun[0].test_run.message).toContain("全部检查通过");

      // 主运行与测试运行都经过 runProjectInSandbox（复用 P2-03 阶段执行）
      expect(env.runProjectInSandbox).toHaveBeenCalledTimes(3);
    } finally {
      env.cleanup();
    }
  });

  it("GET 项目详情返回公开测试与结果，latestSandboxRun 只取 kind=main，隐藏内容不出现", async () => {
    const env = await setup();
    try {
      vi.doMock("@/server/repo/ingest", () => ({
        ingestRepository: vi.fn().mockResolvedValue({
          source: { type: "url", url: "https://github.com/acme/repo.git" },
          head: null, branches: [], commits: [],
          diff: { baseRef: "empty", filesChanged: 1, insertions: 1, deletions: 0, files: [] },
          tree: { fileCount: 1, totalBytes: 2, largestFileBytes: 2, files: ["index.html"] },
          analyzedAt: "2026-08-12T00:00:00.000Z",
        }),
      }));
      await postSubmit(env);

      const { GET } = await import("@/app/api/project/[slug]/route");
      const response = await GET(new NextRequest("http://localhost/api/project/p1-static-page"), {
        params: Promise.resolve({ slug: "p1-static-page" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(body.data.publicTests).toHaveLength(1);
      expect(body.data.publicTestRuns).toHaveLength(1);
      expect(body.data.latestSandboxRun).toMatchObject({ status: "success", runtime: "static" });

      // latestSandboxRun 必须是 main 运行（不能是 hidden 运行）
      const mainRun = env.db.select().from(env.schema.sandboxRuns).where(eq(env.schema.sandboxRuns.kind, "main")).get();
      expect(body.data.latestSandboxRun.id).toBe(mainRun!.id);

      for (const marker of HIDDEN_MARKERS) expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain('"hidden"');
    } finally {
      env.cleanup();
    }
  });
});
