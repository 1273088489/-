// P2-03 API 集成：仓库提交后触发沙箱执行并持久化 sandbox_run。
// runner 模块被 mock（避免真实 Docker），DB 使用迁移后的临时库。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.doUnmock("@/server/ai");
  vi.doUnmock("@/server/repo/ingest");
  vi.doUnmock("@/server/runner");
  vi.doUnmock("@/server/runner/materialize");
  vi.resetModules();
});

function fakeOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runtime: "node",
    status: "success",
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    durationMs: 456,
    timedOut: false,
    oomKilled: false,
    message: undefined,
    phases: [],
    ...overrides,
  };
}

async function setup() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-run-test-"));
  const databasePath = path.join(temporaryDirectory, "api.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();
  process.env.DB_PATH = databasePath;
  vi.resetModules();

  const runProjectInSandbox = vi.fn().mockResolvedValue(fakeOutcome());
  const resolveProjectSandboxConfig = vi.fn((raw: unknown) => ({ runtime: undefined, timeoutMs: 60_000, memoryMb: 512, env: {}, ...(typeof raw === "object" && raw !== null ? raw : {}) }));
  vi.doMock("@/server/runner", () => ({ runProjectInSandbox, resolveProjectSandboxConfig }));
  vi.doMock("@/server/runner/materialize", () => ({
    materializeRepository: async () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-run-mock-"));
      fs.writeFileSync(path.join(projectDir, "package.json"), "{}");
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
  const { users, projectAttempts, repositorySubmissions, sandboxRuns } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const { sqlite } = await import("@/server/db/client");
  await seedCurriculum();
  db.insert(users).values({ id: "learner-1", email: "learner@example.com", name: "学习者", passwordHash: "hash" }).run();

  return {
    temporaryDirectory,
    previousDatabasePath,
    db,
    projectAttempts,
    repositorySubmissions,
    sandboxRuns,
    eq,
    sqlite,
    runProjectInSandbox,
    resolveProjectSandboxConfig,
    cleanup: () => {
      if (sqlite.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

describe("POST /api/project/[slug]/submit 沙箱执行（P2-03）", () => {
  it("解析成功后按项目 sandbox 配置执行并持久化成功记录", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn().mockResolvedValue({
        source: { type: "url", url: "https://github.com/acme/repo.git" },
        head: null,
        branches: [],
        commits: [],
        diff: { baseRef: "empty", filesChanged: 1, insertions: 1, deletions: 0, files: [] },
        tree: { fileCount: 1, totalBytes: 2, largestFileBytes: 2, files: ["index.html"] },
        analyzedAt: "2026-08-12T00:00:00.000Z",
      });
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.sandboxRun).toMatchObject({ status: "success", runtime: "node", exitCode: 0, durationMs: 456 });

      // 项目 sandbox 配置（p1 = static）传给解析器
      expect(env.resolveProjectSandboxConfig).toHaveBeenCalledWith({ runtime: "static" });

      const row = env.db.select().from(env.sandboxRuns).get()!;
      expect(row).toMatchObject({
        status: "success",
        runtime: "node",
        errorCode: "",
        exitCode: 0,
        durationMs: 456,
      });
      expect(row.attemptId).toBe(payload.data.attempt.id);
    } finally {
      env.cleanup();
    }
  });

  it("沙箱执行失败（runtime-error）仍持久化并随 200 返回", async () => {
    const env = await setup();
    try {
      env.runProjectInSandbox.mockResolvedValue(fakeOutcome({
        status: "runtime-error",
        exitCode: 1,
        stdout: "",
        stderr: "Error: boom",
        message: "安装依赖失败（退出码 1）。",
        phases: [{ phase: "install", label: "安装依赖", skipped: false, exitCode: 1, stdout: "", stderr: "Error: boom", durationMs: 10 }],
      }));
      vi.doMock("@/server/repo/ingest", () => ({
        ingestRepository: vi.fn().mockResolvedValue({
          source: { type: "url", url: "https://github.com/acme/repo.git" },
          head: null, branches: [], commits: [],
          diff: { baseRef: "empty", filesChanged: 0, insertions: 0, deletions: 0, files: [] },
          tree: { fileCount: 1, totalBytes: 1, largestFileBytes: 1, files: ["package.json"] },
          analyzedAt: "2026-08-12T00:00:00.000Z",
        }),
      }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p3-react-board" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p3-react-board/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.sandboxRun).toMatchObject({ status: "failed", errorCode: "runtime-error", exitCode: 1 });

      const row = env.db.select().from(env.sandboxRuns).get()!;
      expect(row).toMatchObject({ status: "failed", errorCode: "runtime-error", exitCode: 1 });
      expect(JSON.parse(row.phases)[0]).toMatchObject({ phase: "install", exitCode: 1 });
    } finally {
      env.cleanup();
    }
  });

  it("沙箱不可用（infra-unavailable）返回 502，明确报错且不伪造成功", async () => {
    const env = await setup();
    try {
      env.runProjectInSandbox.mockResolvedValue(fakeOutcome({
        status: "infra-unavailable",
        exitCode: null,
        message: "沙箱不可用：Docker 未安装或守护进程不可达。",
      }));
      vi.doMock("@/server/repo/ingest", () => ({
        ingestRepository: vi.fn().mockResolvedValue({
          source: { type: "url", url: "https://github.com/acme/repo.git" },
          head: null, branches: [], commits: [],
          diff: { baseRef: "empty", filesChanged: 0, insertions: 0, deletions: 0, files: [] },
          tree: { fileCount: 1, totalBytes: 1, largestFileBytes: 1, files: ["package.json"] },
          analyzedAt: "2026-08-12T00:00:00.000Z",
        }),
      }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p3-react-board" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p3-react-board/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(502);
      const payload = await response.json();
      expect(payload.code).toBe("sandbox-infra-unavailable");
      expect(payload.sandboxRun).toMatchObject({ status: "failed", errorCode: "infra-unavailable" });

      const row = env.db.select().from(env.sandboxRuns).get()!;
      expect(row).toMatchObject({ status: "failed", errorCode: "infra-unavailable" });
    } finally {
      env.cleanup();
    }
  });

  it("物化失败（仓库无法重新获取）持久化失败记录并返回 200", async () => {
    const env = await setup();
    try {
      const { RepoError } = await import("@/server/repo/errors");
      vi.doMock("@/server/runner/materialize", () => ({
        materializeRepository: vi.fn().mockRejectedValue(new RepoError("clone-failed", undefined, "第二次克隆失败")),
      }));
      vi.doMock("@/server/repo/ingest", () => ({
        ingestRepository: vi.fn().mockResolvedValue({
          source: { type: "url", url: "https://github.com/acme/repo.git" },
          head: null, branches: [], commits: [],
          diff: { baseRef: "empty", filesChanged: 0, insertions: 0, deletions: 0, files: [] },
          tree: { fileCount: 1, totalBytes: 1, largestFileBytes: 1, files: ["package.json"] },
          analyzedAt: "2026-08-12T00:00:00.000Z",
        }),
      }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p3-react-board" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p3-react-board/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.sandboxRun).toMatchObject({ status: "failed", errorCode: "" });
      expect(env.runProjectInSandbox).not.toHaveBeenCalled();

      const row = env.db.select().from(env.sandboxRuns).get()!;
      expect(row).toMatchObject({ status: "failed", errorCode: "" });
      expect(row.message).toContain("克隆失败");
    } finally {
      env.cleanup();
    }
  });
});
