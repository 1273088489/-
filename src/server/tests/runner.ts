// P2-04 测试执行器：复用 P2-03 runner 的阶段执行（runProjectInSandbox），
// 为每个测试用例准备独立工作区（注入测试文件），以固定命令运行，并归一化结果。
// 安全不变量：
// - 隐藏测试文件只出现在隐藏用例的独立工作区（随机点目录），公开运行不包含隐藏文件；
// - 测试运行配置固定为 runtime=node / install=null / build=null / test=<固定命令>，
//   绝不执行学习者 package.json 中的脚本；
// - 沙箱沿用 P2-01 的 --network=none / --read-only / 资源限额。
import path from "node:path";
import type { DockerExec } from "@/server/sandbox";
import { runProjectInSandbox } from "@/server/runner";
import type { ProjectSandboxConfig } from "@/server/runner/types";
import { parseJson } from "@/server/ai/json";
import { parseTestOutput } from "./parser";
import { prepareTestWorkspace } from "./workspace";
import type {
  ExecuteTestCasesOptions,
  NormalizedTestResult,
  SandboxProjectRunOutcome,
  TestCaseExecution,
  TestCasePlan,
  TestFramework,
  TestKind,
} from "./types";

export { INJECTED_DIR_PREFIX, injectedDirName, prepareTestWorkspace, assertSafeRelativePath } from "./workspace";

/** test_case 行 → 执行计划（command 为空时按 framework 生成默认命令）。 */
export function buildTestCasePlan(row: {
  id: string;
  key: string;
  kind: TestKind;
  name: string;
  framework: TestFramework;
  files: string;
  command: string;
  orderIndex: number;
}): TestCasePlan {
  const files = parseJson<Record<string, string>>(row.files, {});
  if (typeof files !== "object" || files === null || Object.keys(files).length === 0) {
    throw new Error(`测试用例 ${row.key} 未定义任何文件`);
  }
  const command = Array.isArray(parseJson(row.command, []))
    ? (parseJson(row.command, []) as string[]).filter((part) => typeof part === "string" && part.length > 0)
    : [];
  const entryFile = Object.keys(files)[0];
  return {
    key: row.key,
    name: row.name,
    kind: row.kind,
    framework: row.framework,
    files,
    command,
    entryFile,
  };
}

/** 按框架生成容器内测试命令（argv）。 */
export function defaultTestCommand(framework: TestFramework, injectedDir: string, entryFile: string): string[] {
  const entry = path.posix.join(injectedDir, entryFile);
  switch (framework) {
    case "node:test":
      return ["node", "--test", entry];
    case "static-check":
      return ["node", entry];
    case "vitest":
      return ["npx", "--no-install", "vitest", "run", entry];
    case "jest":
      return ["npx", "--no-install", "jest", entry];
    default:
      return ["node", entry];
  }
}

export interface RunTestCaseOptions {
  projectDir: string;
  testCase: ExecuteTestCasesOptions["cases"][number];
  baseConfig: ProjectSandboxConfig;
  docker?: DockerExec;
}

/** 运行单个测试用例并返回归一化结果。 */
export async function runTestCaseInSandbox(options: RunTestCaseOptions): Promise<TestCaseExecution> {
  const { projectDir, testCase, baseConfig, docker } = options;
  const plan = buildTestCasePlan(testCase);
  const workspace = prepareTestWorkspace(projectDir, plan);
  try {
    const command = plan.command.length > 0 ? plan.command : defaultTestCommand(plan.framework, workspace.injectedDir, plan.entryFile);
    // 固定执行计划：只运行测试阶段，绝不执行学习者 install/build/test 脚本。
    const runConfig: ProjectSandboxConfig = {
      ...baseConfig,
      runtime: "node",
      install: null,
      build: null,
      test: command,
    };
    const outcome = await runProjectInSandbox({
      projectDir: workspace.workspaceDir,
      config: runConfig,
      docker,
    });
    const result = normalizeOutcome(outcome, plan.framework);
    return { plan, outcome, result };
  } finally {
    workspace.cleanup();
  }
}

/** 把沙箱整体结果归一化为用例结果。 */
export function normalizeOutcome(outcome: SandboxProjectRunOutcome, framework: TestFramework): NormalizedTestResult {
  // 基础设施类失败（超时/OOM/网络被禁/沙箱不可用）无法解析输出，直接保留原因；
  // runtime-error（测试进程退出码非 0）仍会解析 stdout/stderr，以拿到断言明细。
  if (outcome.status !== "success" && outcome.status !== "runtime-error") {
    const message = outcome.message ?? "测试执行失败（沙箱错误）";
    return {
      passed: false,
      durationMs: outcome.durationMs,
      message,
      counts: { tests: 0, pass: 0, fail: 1, skipped: 0 },
      failures: [message],
    };
  }
  const parsed = parseTestOutput(framework, outcome.stdout, outcome.stderr, outcome.exitCode, outcome.durationMs);
  // 退出码非 0 但解析器未发现失败断言时，强制标记失败并附上输出尾部。
  if (outcome.exitCode !== 0 && parsed.passed) {
    return {
      ...parsed,
      passed: false,
      message: `测试进程退出码非 0（${outcome.exitCode}）：\n${parsed.message}`,
      counts: { ...parsed.counts, fail: parsed.counts.fail + 1 },
    };
  }
  // runtime-error 但没有退出码（异常路径）：保留沙箱消息并强制失败。
  if (outcome.status === "runtime-error" && outcome.exitCode === null) {
    const message = outcome.message ?? parsed.message;
    return {
      ...parsed,
      passed: false,
      message,
      counts: { ...parsed.counts, fail: parsed.counts.fail + 1 },
    };
  }
  return parsed;
}

/** 顺序执行一组测试用例（单个失败不阻断其余用例；基础设施错误也逐用例落记录）。 */
export async function executeTestCases(options: ExecuteTestCasesOptions): Promise<TestCaseExecution[]> {
  const executions: TestCaseExecution[] = [];
  for (const testCase of [...options.cases].sort((a, b) => a.orderIndex - b.orderIndex)) {
    try {
      executions.push(await runTestCaseInSandbox({
        projectDir: options.projectDir,
        testCase,
        baseConfig: options.baseConfig,
        docker: options.docker,
      }));
    } catch (error) {
      const plan = buildTestCasePlan(testCase);
      const message = error instanceof Error ? error.message : String(error);
      executions.push({
        plan,
        outcome: {
          runtime: "node",
          status: "infra-unavailable",
          exitCode: null,
          stdout: "",
          stderr: "",
          durationMs: 0,
          timedOut: false,
          oomKilled: false,
          message: `测试用例准备失败：${message}`,
          phases: [],
        },
        result: {
          passed: false,
          durationMs: 0,
          message: `测试用例准备失败：${message}`,
          counts: { tests: 0, pass: 0, fail: 1, skipped: 0 },
          failures: [message],
        },
      });
    }
  }
  return executions;
}
