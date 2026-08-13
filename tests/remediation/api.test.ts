// P2-06 API 集成：失败评审 → 懒生成补课路径 → 完成 → 更新 mastery/status。
// 覆盖：GET 列表（含 projectSlug 懒生成）、幂等、隐藏测试不泄漏、409 未完成、POST 完成。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

const HIDDEN_MARKERS = ["p1-hidden-baseline-docs", "README 与最小 PRD 基线完整"];

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.resetModules();
});

async function setup() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-remediation-api-"));
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

/** 构造一次评审：attempt + repository_submission + sandbox_run + test_run（公开+隐藏）+ review_feedback。
 * options.failTests=false 时测试全部通过；options.lowRubric=false 时 rubric 全部达到 competent 以上。 */
function seedFailedAttempt(
  env: Awaited<ReturnType<typeof setup>>,
  score: number,
  errorHistory: unknown[],
  options: { failTests?: boolean; lowRubric?: boolean } = {},
) {
  const failTests = options.failTests ?? true;
  const lowRubric = options.lowRubric ?? true;
  const { db, schema } = env;
  const project = db.select().from(schema.stageProjects).where(eq(schema.stageProjects.slug, "p1-static-page")).get()!;
  const now = "2026-08-12T06:00:00.000Z";
  const attempt = db.insert(schema.projectAttempts).values({
    userId: "learner-1",
    projectId: project.id,
    code: "",
    status: "reviewed",
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  const repo = db.insert(schema.repositorySubmissions).values({
    attemptId: attempt.id,
    sourceType: "url",
    sourceUrl: "https://github.com/acme/repo.git",
    status: "parsed",
    snapshot: "{}",
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  const sandboxRun = db.insert(schema.sandboxRuns).values({
    kind: "public",
    attemptId: attempt.id,
    repositorySubmissionId: repo.id,
    runtime: "static",
    status: "failed",
    errorCode: "runtime-error",
    exitCode: 1,
    stdout: "",
    stderr: "",
    phases: "[]",
    startedAt: now,
    finishedAt: now,
    durationMs: 100,
    timedOut: false,
    oomKilled: false,
    message: "",
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  const testCases = db.select().from(schema.testCases).where(eq(schema.testCases.projectId, project.id)).all();
  for (const testCase of testCases) {
    db.insert(schema.testRuns).values({
      sandboxRunId: sandboxRun.id,
      testCaseId: testCase.id,
      attemptId: attempt.id,
      status: failTests ? "failed" : "passed",
      passed: !failTests,
      durationMs: 50,
      message: failTests ? "断言未通过" : "全部检查通过",
      stdout: "",
      stderr: "",
      createdAt: now,
    }).run();
  }

  db.insert(schema.reviewFeedbacks).values({
    attemptId: attempt.id,
    provider: "mock",
    score,
    summary: "需要补课",
    checklist: "[]",
    suggestions: "[]",
    rubricResults: JSON.stringify(lowRubric ? [
      { criterionId: "implementation", criterion: "实现与项目任务一致", weight: 40, level: "developing", score: 20, evidence: [], missingEvidence: [], nextStep: "" },
      { criterionId: "verification", criterion: "验收结论有可审查证据", weight: 35, level: "missing", score: 0, evidence: [], missingEvidence: [], nextStep: "" },
      { criterionId: "decision-record", criterion: "设计决策及取舍有记录", weight: 25, level: "competent", score: 70, evidence: [], missingEvidence: [], nextStep: "" },
    ] : [
      { criterionId: "implementation", criterion: "实现与项目任务一致", weight: 40, level: "competent", score: 80, evidence: [], missingEvidence: [], nextStep: "" },
      { criterionId: "verification", criterion: "验收结论有可审查证据", weight: 35, level: "excellent", score: 100, evidence: [], missingEvidence: [], nextStep: "" },
      { criterionId: "decision-record", criterion: "设计决策及取舍有记录", weight: 25, level: "competent", score: 90, evidence: [], missingEvidence: [], nextStep: "" },
    ]),
    acceptanceResults: "[]",
    evidenceFacts: "[]",
    capabilityNote: "证据化评分",
    createdAt: now,
  }).run();

  db.insert(schema.learningRecords).values({
    userId: "learner-1",
    contentId: project.id,
    contentType: "project",
    status: "needs_review",
    mastery: score,
    errorHistory: JSON.stringify(errorHistory),
    updatedAt: now,
  }).run();

  return { project, attempt };
}

function getRequest(env: Awaited<ReturnType<typeof setup>>, url: string) {
  return new NextRequest(url, { headers: { "content-type": "application/json" } });
}

describe("补课路径 API（P2-06）", () => {
  it("失败评审后 GET ?projectSlug 懒生成补课路径且隐藏测试不泄漏", async () => {
    const env = await setup();
    try {
      const { project } = seedFailedAttempt(env, 55, [{ at: "2026-08-12T05:00:00Z", answer: "git command not found" }]);

      const { GET } = await import("@/app/api/remediation/route");
      const response = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toHaveLength(1);
      const path = body.data[0];
      expect(path.projectId).toBe(project.id);
      expect(path.status).toBe("active");
      expect(path.items.length).toBeGreaterThanOrEqual(2);
      // 顺序：课时在前，项目重交在后
      expect(path.items[0].contentType).toBe("lesson");
      expect(path.items.at(-1).contentType).toBe("project");
      expect(path.explanation).toContain("补课路径共");

      const serialized = JSON.stringify(body);
      for (const marker of HIDDEN_MARKERS) expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain("hidden");

      // 幂等：再次 GET 不产生第二条
      const second = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      const secondBody = await second.json();
      expect(secondBody.data[0].id).toBe(path.id);
      expect(env.db.select().from(env.schema.remediationPaths).all()).toHaveLength(1);
    } finally {
      env.cleanup();
    }
  });

  it("GET 列表返回全部补课路径；项目不存在返回 404", async () => {
    const env = await setup();
    try {
      seedFailedAttempt(env, 60, []);
      const { GET } = await import("@/app/api/remediation/route");

      // 先通过 projectSlug 懒生成
      const generated = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      expect(generated.status).toBe(200);
      expect((await generated.json()).data).toHaveLength(1);

      const list = await GET(getRequest(env, "http://localhost/api/remediation"));
      expect(list.status).toBe(200);
      const listBody = await list.json();
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].items.every((item: { completed: boolean }) => item.completed === false)).toBe(true);

      const missing = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=no-such-project"));
      expect(missing.status).toBe(404);
    } finally {
      env.cleanup();
    }
  });

  it("得分达标且无失败信号时不生成补课路径", async () => {
    const env = await setup();
    try {
      seedFailedAttempt(env, 92, [], { failTests: false, lowRubric: false });
      const { GET } = await import("@/app/api/remediation/route");
      const response = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual([]);
    } finally {
      env.cleanup();
    }
  });

  it("未完成全部补课项时 POST complete 返回 409 与剩余项", async () => {
    const env = await setup();
    try {
      seedFailedAttempt(env, 55, []);
      const { GET } = await import("@/app/api/remediation/route");
      const { POST } = await import("@/app/api/remediation/[id]/complete/route");

      const listResponse = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      const path = (await listResponse.json()).data[0];

      const response = await POST(getRequest(env, `http://localhost/api/remediation/${path.id}/complete`), {
        params: Promise.resolve({ id: path.id }),
      });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.remaining.length).toBeGreaterThan(0);
    } finally {
      env.cleanup();
    }
  });

  it("完成全部补课项后 POST complete 更新路径状态与项目 mastery/status", async () => {
    const env = await setup();
    try {
      const { project } = seedFailedAttempt(env, 55, []);
      const { GET } = await import("@/app/api/remediation/route");
      const listResponse = await GET(getRequest(env, "http://localhost/api/remediation?projectSlug=p1-static-page"));
      const path = (await listResponse.json()).data[0];

      // 补课：完成课时/练习，并重新提交项目达到 80 分
      for (const item of path.items) {
        if (item.contentType === "lesson" || item.contentType === "exercise") {
          env.db.insert(env.schema.learningRecords).values({
            userId: "learner-1",
            contentId: item.contentId,
            contentType: item.contentType,
            status: "completed",
            mastery: 100,
            errorHistory: "[]",
            updatedAt: "2026-08-12T07:00:00.000Z",
          }).run();
        } else {
          env.db.update(env.schema.learningRecords)
            .set({ mastery: 85, updatedAt: "2026-08-12T07:00:00.000Z" })
            .where(eq(env.schema.learningRecords.contentId, project.id))
            .run();
        }
      }

      const { POST } = await import("@/app/api/remediation/[id]/complete/route");
      const response = await POST(getRequest(env, `http://localhost/api/remediation/${path.id}/complete`), {
        params: Promise.resolve({ id: path.id }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).toBe("completed");
      expect(body.data.items.every((item: { completed: boolean }) => item.completed)).toBe(true);
      expect(body.data.completedAt).not.toBe("");

      const learning = env.db.select().from(env.schema.learningRecords).where(eq(env.schema.learningRecords.contentId, project.id)).get()!;
      expect(learning.mastery).toBe(100); // 85 + 20，封顶 100
      expect(learning.status).toBe("completed");

      // 幂等：再次完成直接返回已完成
      const again = await POST(getRequest(env, `http://localhost/api/remediation/${path.id}/complete`), {
        params: Promise.resolve({ id: path.id }),
      });
      expect(again.status).toBe(200);
    } finally {
      env.cleanup();
    }
  });
});
