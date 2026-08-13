// P2-04 test_case / test_run 行 → API 投影。
// 公开结果可返回给学习者；隐藏结果的投影只允许服务端使用（不导出到公共 API）。
import type { TestCase, TestRun } from "@/server/db/schema";
import type { TestCaseRecord, TestRunRecord } from "@/types";

/** test_case 行 → 学习者可见的公开测试定义摘要（不含 files/command 内容）。 */
export function projectTestCaseRecord(row: TestCase): TestCaseRecord {
  return {
    id: row.id,
    name: row.name,
    framework: row.framework,
  };
}

/** test_run 行 + test_case 行 → 单用例运行结果（仅公开测试使用）。 */
export function projectTestRunRecord(row: TestRun, testCase: TestCase): TestRunRecord {
  return {
    id: row.id,
    testCaseId: row.testCaseId,
    name: testCase.name,
    framework: testCase.framework,
    passed: row.passed,
    status: row.status === "passed" ? "passed" : row.status === "skipped" ? "skipped" : row.status === "error" ? "error" : "failed",
    durationMs: row.durationMs,
    message: row.message,
  };
}
