// P2-04 公开测试与隐藏测试 —— 公共出口。
// 公开测试：项目定义、学习者可见；隐藏测试：服务端专用，评估时注入沙箱，
// 结果只落库，绝不进入课程数据 / API / UI。
export { buildTestCasePlan, defaultTestCommand, runTestCaseInSandbox, executeTestCases, normalizeOutcome } from "./runner";
export type { RunTestCaseOptions } from "./runner";
export { parseNodeTestOutput, parseVitestOutput, parseJestOutput, parseStaticCheckOutput, parseTestOutput } from "./parser";
export { prepareTestWorkspace, copyProjectForTests, injectedDirName, assertSafeRelativePath } from "./workspace";
export { projectTestCaseRecord, projectTestRunRecord } from "./record";
export { listProjectTestCases, listPublicTestCases, listPublicTestRunRecords, persistTestCaseExecution } from "./store";
export type { ProjectTestCaseDef, TestKind, TestFramework, TestCasePlan, NormalizedTestResult, TestCaseExecution, ExecuteTestCasesOptions } from "./types";
import type { ProjectSandboxConfig } from "@/server/runner/types";
import { materializeRepository } from "@/server/runner/materialize";
import { isRepoError } from "@/server/repo";
import type { IngestSource } from "@/server/repo/ingest";
import { executeTestCases } from "./runner";
import { listProjectTestCases, persistTestCaseExecution } from "./store";
import type { TestCaseExecution, TestKind } from "./types";

export interface ExecuteProjectTestsOptions {
  source: IngestSource;
  projectId: string;
  attemptId: string;
  repositorySubmissionId: string;
  kind: TestKind;
  /** 已解析的项目 sandbox 配置（镜像/超时/内存/环境）。 */
  baseConfig: ProjectSandboxConfig;
}

/**
 * 评估时执行项目的一类测试（public/hidden）并持久化：
 * - 从 test_case 表读取该 kind 的定义；
 * - 重新物化仓库快照到独立临时目录（与 P2-03 主运行解耦）；
 * - 每个用例独立沙箱运行（固定命令，不执行学习者脚本）；
 * - 每个用例落一条 sandbox_run（kind）+ test_run。
 * 物化失败时逐用例落 error 记录，保证该 attempt 的证据完整。
 */
export async function executeProjectTests(options: ExecuteProjectTestsOptions): Promise<TestCaseExecution[]> {
  const { source, projectId, attemptId, repositorySubmissionId, kind, baseConfig } = options;
  const rows = listProjectTestCases(projectId, kind);
  if (rows.length === 0) return [];

  const materialized = await materializeRepository(source).catch((error: unknown) => {
    // 物化失败：逐用例落 error 记录，不抛错（保持与 P2-03 的失败落库语义一致）。
    const message = isRepoError(error) ? error.message : "测试执行准备失败：无法重新获取仓库快照。";
    const synthetic: TestCaseExecution[] = rows.map((row) => ({
      plan: {
        key: row.key,
        name: row.name,
        kind,
        framework: row.framework as TestCaseExecution["plan"]["framework"],
        files: {},
        command: [],
        entryFile: "",
      },
      outcome: {
        runtime: "node",
        status: "infra-unavailable",
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timedOut: false,
        oomKilled: false,
        message,
        phases: [],
      },
      result: {
        passed: false,
        durationMs: 0,
        message,
        counts: { tests: 0, pass: 0, fail: 1, skipped: 0 },
        failures: [message],
      },
    }));
    for (const execution of synthetic) {
      persistTestCaseExecution({ attemptId, repositorySubmissionId, projectId, execution, kind });
    }
    return null;
  });

  if (!materialized) return [];

  try {
    const executions = await executeTestCases({
      projectDir: materialized.projectDir,
      cases: rows.map((row) => ({ ...row, kind: row.kind as TestKind, framework: row.framework as TestCaseExecution["plan"]["framework"] })),
      baseConfig,
      kind,
    });
    for (const execution of executions) {
      persistTestCaseExecution({ attemptId, repositorySubmissionId, projectId, execution, kind });
    }
    return executions;
  } finally {
    materialized.cleanup();
  }
}
