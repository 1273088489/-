// 沙箱错误分类与判定。
// 分类依据是 docker CLI 输出与容器状态（OOMKilled / 退出码 / stderr），
// 规则尽量保守且可单测；外部文本只用于辅助判定，不作为唯一事实来源。
export const SANDBOX_ERROR_CODES = [
  "timeout",
  "oom",
  "network-blocked",
  "runtime-error",
  "infra-unavailable",
] as const;

export type SandboxErrorCode = (typeof SANDBOX_ERROR_CODES)[number];

export const SANDBOX_ERROR_MESSAGES: Record<SandboxErrorCode, string> = {
  timeout: "沙箱执行超时，容器已被终止。",
  oom: "沙箱内存超限（OOM），容器被内核终止。",
  "network-blocked": "沙箱内网络访问被阻止（--network=none）。",
  "runtime-error": "沙箱内命令执行失败（非零退出码）。",
  "infra-unavailable": "沙箱不可用：Docker 未安装、守护进程不可达或镜像缺失。",
};

export function sandboxErrorMessage(code: SandboxErrorCode): string {
  return SANDBOX_ERROR_MESSAGES[code];
}

/** 沙箱运行失败（含容器级失败与基础设施失败），带结构化上下文。 */
export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly cause: unknown;

  constructor(
    code: SandboxErrorCode,
    message: string,
    options: {
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
    this.exitCode = options.exitCode ?? null;
    this.stdout = options.stdout ?? "";
    this.stderr = options.stderr ?? "";
    this.durationMs = options.durationMs ?? 0;
    this.cause = options.cause;
  }
}

/** 调用方参数错误（编程错误），不属于沙箱错误分类。 */
export class SandboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxConfigError";
  }
}

export function describeCause(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const NETWORK_BLOCKED_PATTERN = new RegExp(
  [
    "fetch failed",
    "could not get any response",
    "network is unreachable",
    "network unreachable",
    "getaddrinfo",
    "enotfound",
    "enetunreach",
    "eai_again",
    "name or service not known",
    "temporary failure in name resolution",
    "could not resolve host",
    "no route to host",
    "host unreachable",
    "connection timed out",
    "connect econnrefused",
    "socket hang up",
    "operation now in progress",
  ].join("|"),
  "i",
);

export function looksLikeNetworkBlocked(text: string): boolean {
  return NETWORK_BLOCKED_PATTERN.test(text);
}

const OOM_PATTERN = new RegExp(
  ["out of memory", "cannot allocate memory", "memory cgroup", "oom-kill", "oom killer", "container.*memory"].join("|"),
  "i",
);

export function looksLikeOom(text: string): boolean {
  return OOM_PATTERN.test(text);
}

/** 容器级失败分类：优先 OOM，其次网络被禁，兜底为运行时错误。 */
export function classifyContainerFailure(input: {
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  oomKilled?: boolean;
}): SandboxErrorCode {
  const text = `${input.stderr ?? ""}\n${input.stdout ?? ""}`;
  if (input.oomKilled || looksLikeOom(text)) return "oom";
  if (looksLikeNetworkBlocked(text)) return "network-blocked";
  return "runtime-error";
}

const DOCKER_UNAVAILABLE_PATTERN = new RegExp(
  [
    "cannot connect to the docker daemon",
    "is the docker daemon running",
    "error during connect",
    "permission denied",
    "connection refused",
    "command not found",
    "no such file or directory",
  ].join("|"),
  "i",
);

export function looksLikeInfraUnavailable(text: string): boolean {
  return DOCKER_UNAVAILABLE_PATTERN.test(text);
}

const IMAGE_MISSING_PATTERN = new RegExp(
  ["unable to find image", "no such image", "pull access denied", "repository does not exist", "manifest unknown", "not found"].join("|"),
  "i",
);

export function looksLikeImageMissing(text: string): boolean {
  return IMAGE_MISSING_PATTERN.test(text);
}

/** docker CLI 级失败分类：镜像缺失或守护进程不可达都归为基础设施不可用。 */
export function classifyDockerCommandFailure(input: {
  error?: unknown;
  stderr?: string;
  timedOut?: boolean;
}): SandboxErrorCode {
  if (input.timedOut) return "timeout";
  // CLI 级失败（守护进程不可达、镜像缺失、spawn ENOENT 等）统一归为基础设施不可用，
  // 由调用方在 message 中带上具体 docker 输出。
  return "infra-unavailable";
}
