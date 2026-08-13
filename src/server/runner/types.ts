// P2-03/P2-07 沙箱执行 —— 结构化类型。
// 项目级 sandbox 配置来自课程数据（curriculum project.sandbox），
// 适配器把配置展开为按阶段（install/build/test/verify/run）执行的 argv 命令，
// 编排器把这些命令在一个受限容器内经 shell 脚本顺序执行并采集证据。
import type { SandboxErrorCode, SandboxRunResult } from "@/server/sandbox";

export type SandboxRuntime = "node" | "python" | "static";

export type SandboxPhaseId = "install" | "build" | "test" | "verify" | "run";

/** 项目级沙箱配置（存于 stage_project.sandbox_config，课程数据 seed）。 */
export interface ProjectSandboxConfig {
  /** 运行时；缺省按仓库结构自动检测（package.json→node，requirements/pyproject→python，否则 static）。 */
  runtime?: SandboxRuntime;
  /** 容器镜像；缺省取 DEFAULT_SANDBOX_IMAGE。 */
  image?: string;
  /** 安装阶段命令（argv）；node 缺省为 npm ci / npm install，python 缺省为 venv+pip install -e 或 pip install -r，static 缺省跳过。 */
  install?: string[] | null;
  /** 构建阶段命令（argv）；null 表示跳过。 */
  build?: string[] | null;
  /** 测试阶段命令（argv）；null 表示跳过。node 缺省：存在 test script 时 npm test；python 缺省：pytest。 */
  test?: string[] | null;
  /** 运行/校验阶段命令（argv）；null 表示跳过。static 缺省：固定 node -e 文件树校验。 */
  run?: string[] | null;
  /** 单阶段/整次运行超时毫秒，默认 60_000，上限 600_000。 */
  timeoutMs?: number;
  /** 内存限制 MB，默认 512。 */
  memoryMb?: number;
  /** 附加环境变量（键名白名单与沙箱一致）。 */
  env?: Record<string, string>;
}

/** 单个阶段的执行计划。 */
export interface SandboxPhase {
  id: SandboxPhaseId;
  label: string;
  /** 容器内 argv 命令（不经调用方 shell；由编排器安全拼接进脚本）。 */
  cmd: string[];
  /** 该阶段因项目结构被跳过（例如无 build/test script）。 */
  skipped?: boolean;
}

/** 单个阶段的执行结果（由容器脚本标记解析得到）。 */
export interface SandboxPhaseResult {
  phase: SandboxPhaseId;
  label: string;
  skipped?: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** 一次项目沙箱执行的整体结果（编排器输出，供 API 持久化）。 */
export interface SandboxProjectRunResult {
  runtime: SandboxRuntime;
  /** 整体状态：success 或沙箱错误分类。 */
  status: "success" | SandboxErrorCode;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  message?: string;
  phases: SandboxPhaseResult[];
  /** 基础容器运行结果（用于诊断/测试）。 */
  raw?: SandboxRunResult;
}

/** 编排器输入。 */
export interface RunProjectInSandboxOptions {
  /** 宿主上已 materialize 的项目目录（内容会 docker cp 进容器）。 */
  projectDir: string;
  /** 已解析的项目沙箱配置。 */
  config: ProjectSandboxConfig;
  /** 测试注入 docker 执行器。 */
  docker?: import("@/server/sandbox").DockerExec;
}
