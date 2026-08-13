// 沙箱运行器：不可信代码只在此处经 Docker 一次性容器执行。
// 主进程永不直接执行学习者代码；Docker 不可用时返回明确错误，绝不回退宿主执行。
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDockerExec, type DockerCommandResult, type DockerExec } from "./docker";
import {
  SandboxConfigError,
  classifyContainerFailure,
  classifyDockerCommandFailure,
  describeCause,
  looksLikeImageMissing,
  sandboxErrorMessage,
  type SandboxErrorCode,
} from "./errors";

export interface RunInSandboxOptions {
  /** 镜像名，例如 node:24-bookworm-slim。 */
  image: string;
  /** 容器内执行的命令（argv 数组，不经 shell，防注入）。 */
  cmd: string[];
  /** 超时毫秒，默认 60_000，上限 600_000。 */
  timeoutMs?: number;
  /** 内存限制 MB，默认 512。 */
  memoryMb?: number;
  /** CPU 限制，默认 1。 */
  cpus?: number;
  /** pids 限制，默认 64。 */
  pidsLimit?: number;
  /** 容器内工作目录，默认 /workspace（匿名可写卷）。 */
  workdir?: string;
  /** 附加环境变量；默认提供 HOME=/tmp（只读根文件系统下可写家目录）。 */
  env?: Record<string, string>;
  /** 覆盖镜像 ENTRYPOINT；传空字符串表示清空（对带 entrypoint 的镜像运行任意命令）。 */
  entrypoint?: string;
  /** 宿主目录：内容会复制进容器 workdir（docker cp，非宿主挂载）。 */
  projectDir?: string;
  /** 宿主可信目录，逐个复制进容器 workdir 内子路径（docker cp，非宿主挂载、不放开网络）。
   * 用于离线依赖缓存等需在容器内可写区预置的内容。默认不复制。 */
  copyDirs?: Array<{ hostPath: string; containerPath: string }>;
  /** 网络模式，默认 none（无网络）。 */
  network?: "none" | "bridge";
  /** 是否只读根文件系统，默认 true。 */
  readOnly?: boolean;
  /** /workspace 匿名卷大小 MB（tmpfs 由 Docker 卷实现，无宿主挂载），默认 256。 */
  tmpfsMb?: number;
  /** 镜像缺失时是否尝试 docker pull，默认 false。 */
  pullImage?: boolean;
  /** 测试注入用 docker 执行器。 */
  docker?: DockerExec;
  /** docker 可执行文件，默认 SANDBOX_DOCKER_BINARY 或 docker。 */
  dockerBinary?: string;
}

export type SandboxRunStatus = "success" | SandboxErrorCode;

export interface SandboxRunResult {
  status: SandboxRunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  /** 非 success 时的人类可读原因。 */
  message?: string;
  containerName?: string;
}

const DEFAULTS = {
  timeoutMs: 60_000,
  memoryMb: 512,
  cpus: 1,
  pidsLimit: 64,
  workdir: "/workspace",
  network: "none" as const,
  tmpfsMb: 256,
};

const MAX_TIMEOUT_MS = 600_000;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function generateContainerName(): string {
  return `quanzhan-sandbox-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function assertValidOptions(options: RunInSandboxOptions): void {
  if (!options.image || typeof options.image !== "string") {
    throw new SandboxConfigError("沙箱参数无效：image 不能为空");
  }
  if (!Array.isArray(options.cmd) || options.cmd.length === 0 || options.cmd.some((part) => typeof part !== "string")) {
    throw new SandboxConfigError("沙箱参数无效：cmd 必须是非空字符串数组");
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > MAX_TIMEOUT_MS)) {
    throw new SandboxConfigError(`沙箱参数无效：timeoutMs 必须在 1..${MAX_TIMEOUT_MS} 之间`);
  }
  if (options.memoryMb !== undefined && (!Number.isFinite(options.memoryMb) || options.memoryMb <= 0)) {
    throw new SandboxConfigError("沙箱参数无效：memoryMb 必须为正数");
  }
  if (options.cpus !== undefined && (!Number.isFinite(options.cpus) || options.cpus <= 0)) {
    throw new SandboxConfigError("沙箱参数无效：cpus 必须为正数");
  }
  if (options.pidsLimit !== undefined && (!Number.isInteger(options.pidsLimit) || options.pidsLimit <= 0)) {
    throw new SandboxConfigError("沙箱参数无效：pidsLimit 必须为正整数");
  }
  if (options.workdir !== undefined && !options.workdir.startsWith("/")) {
    throw new SandboxConfigError("沙箱参数无效：workdir 必须是容器内绝对路径");
  }
  if (options.network !== undefined && options.network !== "none" && options.network !== "bridge") {
    throw new SandboxConfigError("沙箱参数无效：network 仅支持 none 或 bridge");
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new SandboxConfigError(`沙箱参数无效：环境变量名不合法（${key}）`);
    }
    if (typeof value !== "string" || value.includes("\0") || value.includes("\n")) {
      throw new SandboxConfigError(`沙箱参数无效：环境变量 ${key} 的值必须是单行字符串`);
    }
  }
  if (options.projectDir !== undefined) {
    const resolved = path.resolve(options.projectDir);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new SandboxConfigError(`沙箱参数无效：projectDir 必须是存在的目录（${options.projectDir}）`);
    }
  }
  for (const item of options.copyDirs ?? []) {
    assertValidCopyDir(item, options.workdir ?? DEFAULTS.workdir);
  }
}

/** 校验 copyDirs 单项：宿主路径必须存在且是目录，容器路径必须是 workdir 内绝对子路径。 */
function assertValidCopyDir(item: { hostPath: string; containerPath: string }, workdir: string): void {
  const hostResolved = path.resolve(item.hostPath);
  if (!fs.existsSync(hostResolved) || !fs.statSync(hostResolved).isDirectory()) {
    throw new SandboxConfigError(`沙箱参数无效：copyDirs.hostPath 必须是存在的目录（${item.hostPath}）`);
  }
  const { containerPath } = item;
  if (!containerPath.startsWith("/")) {
    throw new SandboxConfigError(`沙箱参数无效：copyDirs.containerPath 必须是容器内绝对路径（${containerPath}）`);
  }
  if (!containerPath.startsWith(`${workdir}/`)) {
    throw new SandboxConfigError(`沙箱参数无效：copyDirs.containerPath 必须位于 workdir 内（${containerPath}）`);
  }
  if (containerPath.split("/").includes("..")) {
    throw new SandboxConfigError(`沙箱参数无效：copyDirs.containerPath 不允许包含 ".." 段（${containerPath}）`);
  }
  // eslint-disable-next-line no-control-regex
  const forbidden = /[\x00-\x1f\x7f]/;
  if (forbidden.test(containerPath)) {
    throw new SandboxConfigError(`沙箱参数无效：copyDirs.containerPath 不允许 NUL/换行/控制字符（${JSON.stringify(containerPath)}）`);
  }
}

export function buildCreateArgs(input: {
  image: string;
  cmd: string[];
  containerName: string;
  network: "none" | "bridge";
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  readOnly: boolean;
  workdir: string;
  tmpfsMb: number;
  env: Record<string, string>;
  entrypoint?: string;
}): string[] {
  const args = ["create"];
  args.push("--network", input.network);
  args.push("--memory", `${input.memoryMb}m`);
  args.push("--cpus", String(input.cpus));
  args.push("--pids-limit", String(input.pidsLimit));
  if (input.readOnly) args.push("--read-only");
  args.push("--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");
  args.push("--security-opt", "no-new-privileges");
  args.push("--cap-drop", "ALL");
  args.push("--workdir", input.workdir);
  // 匿名可写卷：给 workdir 提供可写空间，且不挂载宿主路径、不持久化。
  args.push("-v", input.workdir);
  if (input.entrypoint !== undefined) args.push("--entrypoint", input.entrypoint);
  args.push("--name", input.containerName);
  for (const [key, value] of Object.entries(input.env)) args.push("--env", `${key}=${value}`);
  args.push(input.image, ...input.cmd);
  return args;
}

function failureResult(
  status: SandboxErrorCode,
  fields: {
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    durationMs: number;
    timedOut?: boolean;
    oomKilled?: boolean;
    containerName: string;
    message: string;
  },
): SandboxRunResult {
  return {
    status,
    exitCode: fields.exitCode ?? null,
    stdout: fields.stdout ?? "",
    stderr: fields.stderr ?? "",
    durationMs: fields.durationMs,
    timedOut: fields.timedOut ?? false,
    oomKilled: fields.oomKilled ?? false,
    message: fields.message,
    containerName: fields.containerName,
  };
}

interface ContainerState {
  running: boolean;
  exitCode: number | null;
  oomKilled: boolean;
}

function parseContainerState(raw: string): ContainerState {
  const [running, exitCode, oomKilled] = raw.trim().split(/\s+/);
  return {
    running: running === "true",
    exitCode: Number.isFinite(Number(exitCode)) ? Number(exitCode) : null,
    oomKilled: oomKilled === "true",
  };
}

/**
 * 在一次性 Docker 容器中执行不可信命令。
 * 返回结构化结果（不抛错）；Docker 不可用时 status 为 infra-unavailable，绝不宿主执行。
 */
export async function runInSandbox(options: RunInSandboxOptions): Promise<SandboxRunResult> {
  assertValidOptions(options);

  const exec: DockerExec = options.docker ?? createDockerExec(options.dockerBinary);
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const memoryMb = options.memoryMb ?? DEFAULTS.memoryMb;
  const cpus = options.cpus ?? DEFAULTS.cpus;
  const pidsLimit = options.pidsLimit ?? DEFAULTS.pidsLimit;
  const workdir = options.workdir ?? DEFAULTS.workdir;
  const network = options.network ?? DEFAULTS.network;
  const tmpfsMb = options.tmpfsMb ?? DEFAULTS.tmpfsMb;
  const readOnly = options.readOnly !== false;
  const env: Record<string, string> = { HOME: "/tmp", ...options.env };
  const containerName = generateContainerName();
  const startedAt = Date.now();
  const durationMs = () => Date.now() - startedAt;

  const createArgs = buildCreateArgs({
    image: options.image,
    cmd: options.cmd,
    containerName,
    network,
    memoryMb,
    cpus,
    pidsLimit,
    readOnly,
    workdir,
    tmpfsMb,
    env,
    entrypoint: options.entrypoint,
  });

  let created = await exec(createArgs, { timeoutMs: 30_000 });
  if (created.code !== 0) {
    const createText = `${created.stderr}\n${created.stdout}`;
    if (looksLikeImageMissing(createText) && options.pullImage) {
      const pulled = await exec(["pull", options.image], { timeoutMs: 120_000 });
      if (pulled.code === 0) created = await exec(createArgs, { timeoutMs: 30_000 });
    }
  }
  if (created.code !== 0) {
    const code = classifyDockerCommandFailure({ error: created.error, stderr: created.stderr, timedOut: created.timedOut });
    return failureResult(code, {
      durationMs: durationMs(),
      containerName,
      message: `沙箱容器创建失败（${sandboxErrorMessage(code)}）：${(created.stderr || created.stdout || describeCause(created.error)).trim().slice(0, 500)}`,
    });
  }

  const cleanup = async () => {
    await exec(["rm", "-f", "-v", containerName], { timeoutMs: 30_000 });
  };

  try {
    if (options.projectDir !== undefined) {
      const copied = await exec(["cp", `${path.resolve(options.projectDir)}/.`, `${containerName}:${workdir}`], { timeoutMs: 60_000 });
      if (copied.code !== 0) {
        return failureResult("infra-unavailable", {
          durationMs: durationMs(),
          containerName,
          message: `复制项目到沙箱失败：${(copied.stderr || copied.stdout || describeCause(copied.error)).trim().slice(0, 500)}`,
        });
      }
    }

    for (const item of options.copyDirs ?? []) {
      const copied = await exec(["cp", `${path.resolve(item.hostPath)}/.`, `${containerName}:${item.containerPath}`], { timeoutMs: 60_000 });
      if (copied.code !== 0) {
        return failureResult("infra-unavailable", {
          durationMs: durationMs(),
          containerName,
          message: `复制附加目录到沙箱失败（${item.containerPath}）：${(copied.stderr || copied.stdout || describeCause(copied.error)).trim().slice(0, 500)}`,
        });
      }
    }

    const started = await exec(["start", containerName], { timeoutMs: 30_000 });
    if (started.code !== 0) {
      return failureResult("infra-unavailable", {
        durationMs: durationMs(),
        containerName,
        message: `沙箱容器启动失败：${(started.stderr || started.stdout || describeCause(started.error)).trim().slice(0, 500)}`,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let waited: DockerCommandResult;
    try {
      waited = await exec(["wait", containerName], { signal: controller.signal, timeoutMs: timeoutMs + 5_000 });
    } finally {
      clearTimeout(timer);
    }
    if (waited.code !== 0 && !waited.timedOut && !controller.signal.aborted) {
      return failureResult("infra-unavailable", {
        durationMs: durationMs(),
        containerName,
        message: `沙箱等待失败：${(waited.stderr || waited.stdout || describeCause(waited.error)).trim().slice(0, 500)}`,
      });
    }

    const logs = await exec(["logs", containerName], { timeoutMs: 30_000 });

    let timedOut = waited.timedOut || controller.signal.aborted;
    let state: ContainerState | null = null;

    if (timedOut) {
      // 与超时竞态：若容器其实已经退出，则不判超时，避免误杀。
      const inspected = await exec(["inspect", "--format", "{{.State.Running}} {{.State.ExitCode}} {{.State.OOMKilled}}", containerName], { timeoutMs: 10_000 });
      if (inspected.code === 0) {
        const parsed = parseContainerState(inspected.stdout);
        if (!parsed.running) {
          timedOut = false;
          state = parsed;
        }
      }
      if (timedOut) {
        await exec(["kill", containerName], { timeoutMs: 30_000 });
      }
    }

    if (!timedOut && state === null) {
      const inspected = await exec(["inspect", "--format", "{{.State.Running}} {{.State.ExitCode}} {{.State.OOMKilled}}", containerName], { timeoutMs: 10_000 });
      if (inspected.code === 0) state = parseContainerState(inspected.stdout);
    }

    const exitCode = state?.exitCode ?? null;
    const oomKilled = state?.oomKilled ?? false;
    const base = {
      durationMs: durationMs(),
      containerName,
      stdout: logs.stdout,
      stderr: logs.stderr,
      timedOut,
      oomKilled,
      exitCode,
    };

    if (timedOut) {
      return failureResult("timeout", { ...base, message: sandboxErrorMessage("timeout") });
    }
    if (exitCode === 0) {
      return { status: "success", ...base };
    }
    const code = classifyContainerFailure({ exitCode, stdout: logs.stdout, stderr: logs.stderr, oomKilled });
    const message = code === "network-blocked"
      ? sandboxErrorMessage("network-blocked")
      : code === "oom"
        ? sandboxErrorMessage("oom")
        : `沙箱内命令执行失败（退出码 ${exitCode}）。`;
    return failureResult(code, { ...base, message });
  } finally {
    await cleanup();
  }
}
