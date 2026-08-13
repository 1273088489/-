// P2-03 沙箱执行编排器。
// 把适配器产出的阶段计划合并为一个受限容器内的顺序脚本执行（单容器、共享 node_modules），
// 通过脚本标记把 stdout/stderr/退出码/耗时按阶段拆开，再复用 P2-01 的错误分类。
import { runInSandbox } from "@/server/sandbox";
import type { DockerExec } from "@/server/sandbox";
import { DEFAULT_SANDBOX_IMAGE } from "./config";
import { planPhases } from "./adapters";
import {
  applyNpmOfflineToInstallPhase,
  npmOfflineEnv,
  offlineCacheUsable,
  resolveNpmOfflineCache,
} from "./offline-cache";
import type {
  ProjectSandboxConfig,
  SandboxPhase,
  SandboxPhaseResult,
  SandboxProjectRunResult,
} from "./types";

// 脚本标记（出现概率极低；编排器据此把合并输出拆回各阶段）。
const MARKER_START = "__QZ_PHASE_START__:";
const MARKER_STDOUT = "__QZ_PHASE_STDOUT__:";
const MARKER_STDERR = "__QZ_PHASE_STDERR__:";
const MARKER_EXIT = "__QZ_PHASE_EXIT__:";
const MARKER_DONE = "__QZ_DONE__";

/** POSIX sh 单引号引用（值来自可信配置，仍做防御性转义）。 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 把阶段命令序列生成一个受限容器内执行的 POSIX sh 脚本（fail-fast，退出码为失败阶段码）。 */
export function buildPhaseScript(phases: SandboxPhase[]): string {
  const lines = [
    "set +e",
    "qz_status=0",
    "qz_run() {",
    "  id=$1; shift",
    "  start=$(date +%s%3N)",
    '  echo "__QZ_PHASE_START__:$id"',
    '  "$@" >"/tmp/qz-${id}.out" 2>"/tmp/qz-${id}.err"',
    "  code=$?",
    "  end=$(date +%s%3N)",
    '  echo "__QZ_PHASE_STDOUT__:$id"',
    '  cat "/tmp/qz-${id}.out" 2>/dev/null',
    '  echo "__QZ_PHASE_STDERR__:$id"',
    '  cat "/tmp/qz-${id}.err" 2>/dev/null',
    '  echo "__QZ_PHASE_EXIT__:$id:$code:$((end-start))"',
    "  return $code",
    "}",
  ];
  for (const phase of phases) {
    const command = phase.cmd.map(shellQuote).join(" ");
    lines.push(`if [ "$qz_status" -eq 0 ]; then qz_run ${shellQuote(phase.id)} ${command} || qz_status=$?; fi`);
  }
  lines.push(`echo "${MARKER_DONE}"`);
  lines.push('exit "$qz_status"');
  return lines.join("\n");
}

interface ParsedPhaseOutput {
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
}

/** 从合并 stdout 解析各阶段的 stdout/stderr/退出码/耗时；缺失信息用 null/空串兜底。 */
export function parsePhaseResults(stdout: string, phases: SandboxPhase[]): SandboxPhaseResult[] {
  const parsed = new Map<string, ParsedPhaseOutput>();
  for (const phase of phases) {
    parsed.set(phase.id, { exitCode: null, durationMs: 0, stdout: "", stderr: "" });
  }

  let current: string | null = null;
  let section: "stdout" | "stderr" | null = null;
  for (const line of stdout.split("\n")) {
    if (line === MARKER_DONE) break;
    let match = line.match(/^__QZ_PHASE_START__:(.+)$/);
    if (match) {
      current = match[1];
      section = null;
      continue;
    }
    match = line.match(/^__QZ_PHASE_STDOUT__:(.+)$/);
    if (match) {
      current = match[1];
      section = "stdout";
      continue;
    }
    match = line.match(/^__QZ_PHASE_STDERR__:(.+)$/);
    if (match) {
      current = match[1];
      section = "stderr";
      continue;
    }
    match = line.match(/^__QZ_PHASE_EXIT__:(.+):(\d+):(\d+)$/);
    if (match) {
      const entry = parsed.get(match[1]);
      if (entry) {
        entry.exitCode = Number(match[2]);
        entry.durationMs = Number(match[3]);
      }
      current = null;
      section = null;
      continue;
    }
    if (current && section && parsed.has(current)) {
      const entry = parsed.get(current)!;
      if (section === "stdout") entry.stdout += entry.stdout.length === 0 ? line : `\n${line}`;
      else entry.stderr += entry.stderr.length === 0 ? line : `\n${line}`;
    }
  }

  return phases.map((phase) => ({
    phase: phase.id,
    label: phase.label,
    skipped: phase.skipped === true,
    exitCode: phase.skipped ? null : (parsed.get(phase.id)?.exitCode ?? null),
    stdout: phase.skipped ? "" : (parsed.get(phase.id)?.stdout ?? ""),
    stderr: phase.skipped ? "" : (parsed.get(phase.id)?.stderr ?? ""),
    durationMs: phase.skipped ? 0 : (parsed.get(phase.id)?.durationMs ?? 0),
  }));
}

/** 去掉脚本标记行，得到干净的整体 stdout（供入库/展示）。 */
export function stripPhaseMarkers(stdout: string): string {
  return stdout
    .split("\n")
    .filter((line) => !line.startsWith(MARKER_START) && !line.startsWith(MARKER_STDOUT) && !line.startsWith(MARKER_STDERR) && !line.startsWith(MARKER_EXIT) && line !== MARKER_DONE)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RunProjectInSandboxOptions {
  projectDir: string;
  config: ProjectSandboxConfig;
  /** 测试注入 docker 执行器。 */
  docker?: DockerExec;
  /**
   * 显式指定 npm 离线缓存（测试用）；undefined 时默认 resolveNpmOfflineCache(process.env)，
   * 传 null 显式禁用。
   */
  offlineCache?: { hostDir: string; containerPath: string } | null;
}

/**
 * 在受限沙箱中按项目配置执行仓库快照。
 * 返回结构化结果（含逐阶段证据），永不抛错回退到宿主执行；
 * 沙箱不可用时返回 status=infra-unavailable。
 */
export async function runProjectInSandbox(options: RunProjectInSandboxOptions): Promise<SandboxProjectRunResult> {
  const { projectDir, config, docker } = options;
  const plan = planPhases(projectDir, config);
  const cache = options.offlineCache ?? resolveNpmOfflineCache(process.env);
  const hasNpmInstallPhase = plan.phases.some(
    (phase) => phase.id === "install" && phase.skipped !== true && phase.cmd[0] === "npm",
  );
  const offlineApplied =
    cache !== null && offlineCacheUsable(cache) && plan.runtime === "node" && hasNpmInstallPhase;
  // 离线缓存只在本模块强制项下生效：必须先在计划上改写 install 阶段，再 buildPhaseScript。
  const phases = offlineApplied
    ? plan.phases.map((phase) => (phase.id === "install" ? applyNpmOfflineToInstallPhase(phase, cache) : phase))
    : plan.phases;
  let copyDirs: Array<{ hostPath: string; containerPath: string }> | undefined;
  let sandboxEnv: Record<string, string> | undefined = config.env;
  if (offlineApplied) {
    copyDirs = [{ hostPath: cache.hostDir, containerPath: cache.containerPath }];
    // 离线配置是强制项，必须覆盖 config.env 的同名键。
    sandboxEnv = { ...config.env, ...npmOfflineEnv(cache) };
  }
  const executedPhases = phases.filter((phase) => !phase.skipped);

  const startedAt = Date.now();
  if (executedPhases.length === 0) {
    return {
      runtime: plan.runtime,
      status: "success",
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - startedAt,
      timedOut: false,
      oomKilled: false,
      message: "项目没有需要执行的安装/构建/测试阶段",
      phases: plan.phases.map((phase) => ({
        phase: phase.id,
        label: phase.label,
        skipped: true,
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
      })),
    };
  }

  const script = buildPhaseScript(executedPhases);
  const outcome = await runInSandbox({
    image: config.image ?? DEFAULT_SANDBOX_IMAGE,
    cmd: ["sh", "-c", script],
    entrypoint: "",
    projectDir,
    timeoutMs: config.timeoutMs,
    memoryMb: config.memoryMb,
    env: sandboxEnv,
    copyDirs,
    docker,
  });

  const phaseResults = parsePhaseResults(outcome.stdout, phases);
  const failedPhase = phaseResults.find((phase) => !phase.skipped && phase.exitCode !== null && phase.exitCode !== 0);
  const status = outcome.status === "success" ? "success" : outcome.status;
  const message =
    status === "success"
      ? undefined
      : status === "runtime-error" && failedPhase
        ? `${failedPhase.label}失败（退出码 ${failedPhase.exitCode}）`
        : outcome.message;

  return {
    runtime: plan.runtime,
    status,
    exitCode: outcome.exitCode,
    stdout: stripPhaseMarkers(outcome.stdout),
    stderr: outcome.stderr,
    durationMs: outcome.durationMs,
    timedOut: outcome.timedOut,
    oomKilled: outcome.oomKilled,
    message,
    phases: phaseResults,
    raw: outcome,
  };
}
