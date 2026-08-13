// 受控子进程执行器：spawn（不经 shell），带超时与输出上限。
// 用于 git / tar 等系统工具；学习者代码永不在此执行。
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  /** stdout/stderr 是否因超过 maxOutputBytes 被截断。 */
  truncated: boolean;
}

export interface CommandOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** 子进程工作目录（git 分析必须指向仓库目录）。 */
  cwd?: string;
}

function createCollector(limit: number): { push(chunk: Buffer): void; text: string; truncated: boolean } {
  let buffer = "";
  let truncated = false;
  return {
    push(chunk: Buffer) {
      const text = chunk.toString("utf8");
      const remaining = limit - buffer.length;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      buffer += text.slice(0, remaining);
      if (text.length > remaining) truncated = true;
    },
    get text() {
      return buffer;
    },
    get truncated() {
      return truncated;
    },
  };
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;

export async function runCommand(
  binary: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_COMMAND_OUTPUT_BYTES;

  return new Promise<CommandResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], cwd: options.cwd });
    } catch (error) {
      resolve({ stdout: "", stderr: "", code: null, signal: null, timedOut: false, truncated: false, ...(error instanceof Error ? { stderr: error.message } : {}) });
      return;
    }

    const stdout = createCollector(maxOutputBytes);
    const stderr = createCollector(maxOutputBytes);
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };
    const settle = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      settle({
        stdout: stdout.text,
        stderr: stderr.text || error.message,
        code: null,
        signal: null,
        timedOut,
        truncated: stdout.truncated || stderr.truncated,
      });
    });
    child.on("close", (code, signal) => {
      settle({
        stdout: stdout.text,
        stderr: stderr.text,
        code,
        signal,
        timedOut,
        truncated: stdout.truncated || stderr.truncated,
      });
    });
  });
}
