// P2-04 持久化与查询：test_case / test_run 表的写入与公开结果查询。
// 隐藏测试的 test_run 行只写不读（绝不进入任何公开 API 查询路径）。
import { and, desc, eq } from "drizzle-orm";
import { appDb } from "@/server/review/service";
import { sandboxRuns, testCases, testRuns } from "@/server/db/schema";
import type { TestCase, TestRun } from "@/server/db/schema";
import { projectTestRunRecord } from "./record";
import type { TestCaseExecution, TestKind } from "./types";
import type { TestRunRecord } from "@/types";

/** 查询项目下某一类（public/hidden）的测试定义。 */
export function listProjectTestCases(projectId: string, kind: TestKind): TestCase[] {
  return appDb
    .select()
    .from(testCases)
    .where(and(eq(testCases.projectId, projectId), eq(testCases.kind, kind)))
    .orderBy(testCases.orderIndex)
    .all();
}

/** 查询项目公开测试定义（供项目详情 API 展示）。 */
export function listPublicTestCases(projectId: string): TestCase[] {
  return listProjectTestCases(projectId, "public");
}

/** 把单用例执行结果持久化为 sandbox_run（kind=public|hidden）+ test_run。 */
export function persistTestCaseExecution(input: {
  attemptId: string;
  repositorySubmissionId: string;
  projectId: string;
  execution: TestCaseExecution;
  kind: TestKind;
}): { sandboxRunId: string; testRun: TestRun } {
  const { attemptId, repositorySubmissionId, execution, kind } = input;
  const outcome = execution.outcome;
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const sandboxRunId = appDb
    .insert(sandboxRuns)
    .values({
      kind,
      attemptId,
      repositorySubmissionId,
      runtime: outcome.runtime === "static" ? "static" : "node",
      status: outcome.status === "success" ? "success" : "failed",
      errorCode: outcome.status === "success" ? "" : outcome.status,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      phases: JSON.stringify(outcome.phases),
      startedAt,
      finishedAt,
      durationMs: outcome.durationMs,
      timedOut: outcome.timedOut,
      oomKilled: outcome.oomKilled,
      message: outcome.message ?? "",
      createdAt: startedAt,
      updatedAt: finishedAt,
    })
    .returning({ id: sandboxRuns.id })
    .get().id;

  const testCaseId = appDb
    .select()
    .from(testCases)
    .where(and(eq(testCases.projectId, input.projectId), eq(testCases.key, execution.plan.key)))
    .get()?.id;
  if (!testCaseId) throw new Error(`test_case 不存在：${execution.plan.key}`);

  const testRun = appDb
    .insert(testRuns)
    .values({
      sandboxRunId,
      testCaseId,
      attemptId,
      status: execution.result.passed ? "passed" : outcome.status === "success" ? "failed" : "error",
      passed: execution.result.passed,
      durationMs: execution.result.durationMs,
      message: execution.result.message,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      createdAt: finishedAt,
    })
    .returning()
    .get();

  return { sandboxRunId, testRun };
}

/** 查询某次 attempt 的公开测试运行结果（只关联 kind=public 的 test_case）。 */
export function listPublicTestRunRecords(attemptId: string): TestRunRecord[] {
  const rows = appDb
    .select({ run: testRuns, testCase: testCases })
    .from(testRuns)
    .innerJoin(testCases, eq(testRuns.testCaseId, testCases.id))
    .where(and(eq(testRuns.attemptId, attemptId), eq(testCases.kind, "public")))
    .orderBy(desc(testRuns.createdAt))
    .all();
  return rows.map(({ run, testCase }) => projectTestRunRecord(run, testCase));
}
