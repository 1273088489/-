import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoError } from "@/server/repo/errors";
import { applyMigrations } from "../helpers/ddl";
import type { RepoSnapshot } from "@/server/repo/types";

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.doUnmock("@/server/ai");
  vi.doUnmock("@/server/repo/ingest");
  vi.doUnmock("@/server/runner");
  vi.doUnmock("@/server/runner/materialize");
  vi.resetModules();
});

function fakeSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    source: { type: "url", url: "https://github.com/acme/repo.git" },
    head: {
      branch: "main",
      commitHash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "init",
      authorName: "Learner",
      authorEmail: "learner@example.com",
      committedAt: "2026-08-12T00:00:00.000Z",
    },
    branches: [{ name: "main", isHead: true, isRemote: false }],
    commits: [{ hash: "a".repeat(40), shortHash: "aaaaaaa", authorName: "Learner", authorEmail: "learner@example.com", committedAt: "2026-08-12T00:00:00.000Z", subject: "init" }],
    diff: {
      baseRef: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      filesChanged: 1,
      insertions: 1,
      deletions: 0,
      files: [{ path: "a.txt", status: "added", insertions: 1, deletions: 0, lineRanges: [{ startLine: 1, endLine: 1, additions: 1, deletions: 0 }] }],
    },
    tree: { fileCount: 1, totalBytes: 2, largestFileBytes: 2, files: ["a.txt"] },
    analyzedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

/** 沙箱执行的默认成功结果（route 依赖 runProjectInSandbox 的返回值）。 */
function fakeSandboxOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runtime: "static",
    status: "success",
    exitCode: 0,
    stdout: "STATIC_VERIFY files=2\n",
    stderr: "",
    durationMs: 123,
    timedOut: false,
    oomKilled: false,
    message: undefined,
    phases: [{ phase: "verify", label: "静态文件校验", skipped: false, exitCode: 0, stdout: "STATIC_VERIFY files=2", stderr: "", durationMs: 123 }],
    ...overrides,
  };
}

async function setup() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-repo-submit-test-"));
  const databasePath = path.join(temporaryDirectory, "api.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();
  process.env.DB_PATH = databasePath;
  vi.resetModules();

  vi.doMock("@/server/runner", () => ({
    runProjectInSandbox: vi.fn().mockResolvedValue(fakeSandboxOutcome()),
    resolveProjectSandboxConfig: (raw: unknown) => ({ runtime: undefined, install: undefined, build: undefined, test: undefined, timeoutMs: 60_000, memoryMb: 512, env: {}, ...(typeof raw === "object" && raw !== null ? raw : {}) }),
  }));
  vi.doMock("@/server/runner/materialize", () => ({
    materializeRepository: async () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-run-mock-"));
      fs.writeFileSync(path.join(projectDir, "index.html"), "<h1>ok</h1>\n");
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
    cleanup: () => {
      if (sqlite.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

describe("POST /api/project/[slug]/submit（仓库接收）", () => {
  it("JSON repoUrl 提交：解析成功并持久化 repository_submission", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn().mockResolvedValue(fakeSnapshot());
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
      expect(payload.ok).toBe(true);
      expect(payload.data.repository.head?.branch).toBe("main");
      expect(payload.data.repository.source.url).toBe("https://github.com/acme/repo.git");

      const row = env.db.select().from(env.repositorySubmissions).get()!;
      expect(row).toMatchObject({
        attemptId: payload.data.attempt.id,
        sourceType: "url",
        sourceUrl: "https://github.com/acme/repo.git",
        status: "parsed",
        error: "",
      });
      expect(JSON.parse(row.snapshot).tree.fileCount).toBe(1);
      // P2-05：仓库提交成功后已执行证据化评分，attempt 状态为 reviewed。
      expect(env.db.select().from(env.projectAttempts).get()?.status).toBe("reviewed");
      // P2-03：解析成功后触发沙箱执行并持久化 sandbox_run
      expect(payload.data.sandboxRun).toMatchObject({ status: "success", runtime: "static", exitCode: 0 });
      const runRow = env.db.select().from(env.sandboxRuns).get()!;
      expect(runRow).toMatchObject({ attemptId: payload.data.attempt.id, repositorySubmissionId: row.id, status: "success", runtime: "static" });
      expect(JSON.parse(runRow.phases)).toHaveLength(1);
    } finally {
      env.cleanup();
    }
  });

  it("非法 repoUrl 直接拒绝，不调用 ingest、不创建 attempt", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn();
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "git@github.com:acme/repo.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(422);
      const payload = await response.json();
      expect(payload.code).toBe("invalid-url");
      expect(ingestRepository).not.toHaveBeenCalled();
      expect(env.db.select().from(env.projectAttempts).all()).toHaveLength(0);
    } finally {
      env.cleanup();
    }
  });

  it("multipart 上传 zip：解析成功并记录 archive 来源", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn().mockResolvedValue(fakeSnapshot({ source: { type: "archive", archiveName: "repo.zip", archiveKind: "zip" } }));
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const formData = new FormData();
      formData.set("archive", new File([Buffer.from("zip-bytes")], "repo.zip", { type: "application/zip" }));
      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: formData,
      }), context);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.repository.source.archiveName).toBe("repo.zip");
      const row = env.db.select().from(env.repositorySubmissions).get()!;
      expect(row).toMatchObject({ sourceType: "archive", archiveName: "repo.zip", archiveKind: "zip", status: "parsed" });
    } finally {
      env.cleanup();
    }
  });

  it("非压缩包文件名直接拒绝", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn();
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const formData = new FormData();
      formData.set("archive", new File([Buffer.from("x")], "notes.txt", { type: "text/plain" }));
      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: formData,
      }), context);

      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe("invalid-archive");
      expect(ingestRepository).not.toHaveBeenCalled();
    } finally {
      env.cleanup();
    }
  });

  it("超过 50MB 的压缩包直接拒绝（不调用 ingest）", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn();
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const formData = new FormData();
      formData.set("archive", new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.zip", { type: "application/zip" }));
      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: formData,
      }), context);

      expect(response.status).toBe(413);
      expect((await response.json()).code).toBe("archive-too-large");
      expect(ingestRepository).not.toHaveBeenCalled();
    } finally {
      env.cleanup();
    }
  });

  it("ingest 失败：记录 failed 状态并返回错误码", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn().mockRejectedValue(new RepoError("clone-failed"));
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://github.com/acme/nonexistent.git" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.code).toBe("clone-failed");
      const row = env.db.select().from(env.repositorySubmissions).get()!;
      expect(row).toMatchObject({ status: "failed", sourceType: "url" });
      expect(row.error).toContain("克隆失败");
      expect(env.db.select().from(env.projectAttempts).get()?.status).toBe("submitted");
    } finally {
      env.cleanup();
    }
  });

  it("文本 code 提交路径保持不变（调用 AI review，不调用 ingest）", async () => {
    const env = await setup();
    try {
      const ingestRepository = vi.fn();
      vi.doMock("@/server/repo/ingest", () => ({ ingestRepository }));
      const { POST } = await import("@/app/api/project/[slug]/submit/route");
      const context = { params: Promise.resolve({ slug: "p1-static-page" }) };

      const response = await POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
        method: "POST",
        body: JSON.stringify({ code: "const app = true" }),
        headers: { "content-type": "application/json" },
      }), context);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.attempt.status).toBe("reviewed");
      expect(payload.data.review.provider).toBe("test");
      expect(ingestRepository).not.toHaveBeenCalled();
      expect(env.db.select().from(env.repositorySubmissions).all()).toHaveLength(0);
    } finally {
      env.cleanup();
    }
  });
});
