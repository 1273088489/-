// P2-05 API 集成：仓库提交后执行证据化评分并持久化 evidence_fact/review_feedback；
// 响应与 GET 返回 review + evidenceFacts（仅公开证据），隐藏测试标识绝不泄漏。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
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
    phases: [{ phase: "verify", label: "静态文件校验", exitCode: 0, stdout: "STATIC_VERIFY files=2", stderr: "", durationMs: 100 }],
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
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-evidence-api-"));
  const databasePath = path.join(temporaryDirectory, "api.db");
  const previousDatabasePath = process.env.DB_PATH;
  const migrationDatabase = new Database(databasePath);
  applyMigrations(migrationDatabase);
  migrationDatabase.close();
  process.env.DB_PATH = databasePath;
  vi.resetModules();

  vi.doMock("@/server/runner", () => ({
    runProjectInSandbox: vi.fn(async (options: { config?: Record<string, unknown> }) => {
      if (Array.isArray(options.config?.test)) return fakeOutcome({ runtime: "node" });
      return fakeOutcome({ runtime: "static" });
    }),
    resolveProjectSandboxConfig: vi.fn((raw: unknown) => ({
      runtime: undefined,
      timeoutMs: 60_000,
      memoryMb: 512,
      env: {},
      ...(typeof raw === "object" && raw !== null ? raw : {}),
    })),
  }));
  vi.doMock("@/server/runner/materialize", () => ({
    materializeRepository: async () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-evidence-materialize-"));
      fs.writeFileSync(path.join(projectDir, "README.md"), "# 工单系统\n本地运行命令：npm start\nPRD 记录范围、验收标准和被放弃方案\n");
      fs.writeFileSync(path.join(projectDir, "index.html"), "<h1>工单系统</h1><p>目标用户：客服</p>");
      return { projectDir, cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }) };
    },
  }));
  vi.doMock("@/server/auth/session", () => ({
    getSessionUser: vi.fn().mockResolvedValue({ id: "learner-1" }),
  }));
  vi.doMock("@/server/ai", () => ({
    getAiProvider: () => ({ name: "test", review: vi.fn().mockResolvedValue({ score: 81, summary: "证据化评审完成", checklist: [], suggestions: [], provider: "test" }) }),
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
    cleanup: () => {
      if (sqlite.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

async function postSubmit(env: Awaited<ReturnType<typeof setup>>) {
  vi.doMock("@/server/repo/ingest", () => ({
    ingestRepository: vi.fn().mockResolvedValue({
      source: { type: "url", url: "https://github.com/acme/repo.git" },
      head: null, branches: [], commits: [],
      diff: { baseRef: "empty", filesChanged: 2, insertions: 10, deletions: 0, files: [{ path: "README.md", status: "added", insertions: 6, deletions: 0 }, { path: "index.html", status: "added", insertions: 4, deletions: 0 }] },
      tree: { fileCount: 2, totalBytes: 100, largestFileBytes: 60, files: ["README.md", "index.html"] },
      analyzedAt: "2026-08-12T00:00:00.000Z",
    }),
  }));
  const { POST } = await import("@/app/api/project/[slug]/submit/route");
  const context = { params: Promise.resolve({ slug: "p1-static-page" }) };
  return POST(new NextRequest("http://localhost/api/project/p1-static-page/submit", {
    method: "POST",
    body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }),
    headers: { "content-type": "application/json" },
  }), context);
}

describe("POST/GET 项目 证据化评分（P2-05）", () => {
  it("提交响应包含 review + evidenceFacts，review_feedback/evidence_fact 持久化，隐藏证据不泄漏", async () => {
    const env = await setup();
    try {
      const response = await postSubmit(env);
      expect(response.status).toBe(200);
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(body.data.attempt.status).toBe("reviewed");
      expect(body.data.review).toBeDefined();
      expect(body.data.review.score).toBe(81);
      expect(body.data.review.rubricResults).toHaveLength(3);
      expect(body.data.review.capabilityNote).toContain("公开测试 1/1 通过");
      expect(body.data.review.capabilityNote).toContain("沙箱主执行");
      expect(body.data.review.evidenceFacts.length).toBeGreaterThanOrEqual(4);
      expect(body.data.review.evidenceFacts.map((fact: { sourceType: string }) => fact.sourceType).sort()).toEqual(
        expect.arrayContaining(["git_diff", "test_output", "file_content", "runtime"]),
      );

      for (const marker of HIDDEN_MARKERS) expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain("hidden");
      expect(serialized).not.toContain('"internal"');

      // review_feedback 新列已持久化
      const attempt = env.db.select().from(env.schema.projectAttempts).where(eq(env.schema.projectAttempts.userId, "learner-1")).get()!;
      const feedback = env.db.select().from(env.schema.reviewFeedbacks).where(eq(env.schema.reviewFeedbacks.attemptId, attempt.id)).get()!;
      expect(feedback.rubricResults).toContain("implementation");
      expect(feedback.acceptanceResults).toContain("supported");
      expect(feedback.capabilityNote).toContain("证据化评分");
      expect(feedback.evidenceFacts).toContain("test_output");

      // evidence_fact：公开 + internal（隐藏测试）均落库
      const facts = env.db.select().from(env.schema.evidenceFacts).where(eq(env.schema.evidenceFacts.attemptId, attempt.id)).all();
      expect(facts.some((fact) => fact.internal === true && fact.sourceType === "test_output")).toBe(true);
      expect(facts.some((fact) => fact.internal === false && fact.sourceType === "runtime")).toBe(true);
    } finally {
      env.cleanup();
    }
  });

  it("GET 项目详情返回持久化反馈与公开证据", async () => {
    const env = await setup();
    try {
      await postSubmit(env);

      const { GET } = await import("@/app/api/project/[slug]/route");
      const response = await GET(new NextRequest("http://localhost/api/project/p1-static-page"), {
        params: Promise.resolve({ slug: "p1-static-page" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(body.data.feedback).not.toBeNull();
      expect(body.data.feedback.score).toBe(81);
      expect(body.data.feedback.evidenceFacts.length).toBeGreaterThan(0);
      expect(body.data.feedback.rubricResults).toHaveLength(3);
      expect(body.data.feedback.capabilityNote).toContain("证据化评分");

      for (const marker of HIDDEN_MARKERS) expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain('"hidden"');
    } finally {
      env.cleanup();
    }
  });

  it("AI provider 失败返回 502，不落 review_feedback/evidence_fact（不伪造评分）", async () => {
    const env = await setup();
    try {
      vi.doMock("@/server/ai", () => ({
        getAiProvider: () => ({ name: "test", review: vi.fn().mockRejectedValue(new Error("AI provider timeout")) }),
      }));
      const response = await postSubmit(env);
      expect(response.status).toBe(502);
      const payload = await response.json();
      expect(payload.code).toBe("AI_PROVIDER_TIMEOUT");

      const attempt = env.db.select().from(env.schema.projectAttempts).where(eq(env.schema.projectAttempts.userId, "learner-1")).get()!;
      expect(env.db.select().from(env.schema.reviewFeedbacks).where(eq(env.schema.reviewFeedbacks.attemptId, attempt.id)).all()).toHaveLength(0);
      expect(env.db.select().from(env.schema.evidenceFacts).where(eq(env.schema.evidenceFacts.attemptId, attempt.id)).all()).toHaveLength(0);
    } finally {
      env.cleanup();
    }
  });
});
