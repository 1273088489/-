// P2-04 公开测试与隐藏测试 —— 类型定义。
// 公开测试：项目定义、学习者可见；隐藏测试：服务端专用，评估时注入沙箱，
// 绝不进入课程公开数据 / API / UI。
import type { SandboxPhaseId, ProjectSandboxConfig } from "@/server/runner/types";

export type TestKind = "public" | "hidden";

/** 测试运行框架。vitest/jest 解析能力内置，v1 课程数据以 node:test / static-check 为主。 */
export type TestFramework = "node:test" | "vitest" | "jest" | "static-check";

/** 课程数据 / test_case 行中的单个测试定义。 */
export interface ProjectTestCaseDef {
  /** 项目内稳定标识（test_case.key）。 */
  id: string;
  name: string;
  framework: TestFramework;
  /** 注入到沙箱测试目录的文件（相对路径 -> 内容）。 */
  files: Record<string, string>;
  /** 可选命令覆盖（argv）；缺省按 framework 生成。 */
  command?: string[];
  orderIndex?: number;
}

/** 已解析的测试执行计划（来自 test_case 行）。 */
export interface TestCasePlan {
  key: string;
  name: string;
  kind: TestKind;
  framework: TestFramework;
  files: Record<string, string>;
  /** 覆盖命令（argv）；空数组表示按 framework 生成默认命令。 */
  command: string[];
  /** 注入目录内的入口文件名（files 的第一个键）。 */
  entryFile: string;
}

/** 单个测试用例的归一化结果。 */
export interface NormalizedTestResult {
  passed: boolean;
  durationMs: number;
  /** 人类可读消息：通过时简短说明，失败时带断言明细。 */
  message: string;
  counts: {
    tests: number;
    pass: number;
    fail: number;
    skipped: number;
  };
  /** 失败断言明细（供证据/评分使用）。 */
  failures: string[];
}

/** 单用例沙箱执行产物（runner 输出，供持久化）。 */
export interface TestCaseExecution {
  plan: TestCasePlan;
  /** 该用例的沙箱执行结果（kind=public|hidden 的 sandbox_run 行）。 */
  outcome: SandboxProjectRunOutcome;
  result: NormalizedTestResult;
}

/** runner 返回结构（与 SandboxProjectRunResult 对齐，避免直接依赖 runner 内部细节）。 */
export interface SandboxProjectRunOutcome {
  runtime: "node" | "python" | "static";
  status: "success" | "timeout" | "oom" | "network-blocked" | "runtime-error" | "infra-unavailable";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  message?: string;
  phases: Array<{
    phase: SandboxPhaseId;
    label: string;
    skipped?: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
  }>;
}

/** 执行一组用例的输入。 */
export interface ExecuteTestCasesOptions {
  /** 宿主上已 materialize 的学习者项目目录（测试运行前会复制到独立工作区）。 */
  projectDir: string;
  /** test_case 行（同一 kind）。 */
  cases: Array<{
    id: string;
    key: string;
    kind: TestKind;
    name: string;
    framework: TestFramework;
    files: string;
    command: string;
    orderIndex: number;
  }>;
  /** 已解析的项目 sandbox 配置（镜像/超时/内存/环境）。 */
  baseConfig: ProjectSandboxConfig;
  kind: TestKind;
  /** 测试注入 docker 执行器。 */
  docker?: import("@/server/sandbox").DockerExec;
}
