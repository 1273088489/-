// docker CLI 执行器：以子进程方式调用 docker，收集 stdout/stderr，
// 支持硬超时与 AbortSignal 中止（用于杀死阻塞中的 `docker wait`）。
import { spawn } from "node:child_process";

/** 单个 docker CLI 调用的结果。code 为 null 表示进程被信号终止或未能启动。 */
export interface DockerCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  error?: Error;
}

export interface DockerExecOptions {
  /** 硬超时：超过后 SIGKILL 子进程并标记 timedOut。 */
  timeoutMs?: number;
  /** 中止信号：触发后 SIGKILL 子进程并标记 timedOut。 */
  signal?: AbortSignal;
}

export type DockerExec = (args: string[], options?: DockerExecOptions) => Promise<DockerCommandResult>;

/** 单流输出上限，防止学习者/命令刷屏导致宿主内存膨胀。 */
export const DOCKER_OUTPUT_LIMIT_BYTES = 1_000_000;

interface OutputCollector {
  push(chunk: Buffer | string): void;
  readonly text: string;
}

function createCollector(limit: number): OutputCollector {
  let buffer = "";
  let truncated = false;
  return {
    push(chunk) {
      if (truncated) return;
      const text = chunk.toString();
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
  };
}

/**
 * 创建 docker CLI 执行器。binary 默认取环境变量 SANDBOX_DOCKER_BINARY 或 "docker"，
 * 便于在受限环境指向受控的 docker 二进制（例如 sudo 包装）。
 */
export function createDockerExec(binary: string = process.env.SANDBOX_DOCKER_BINARY ?? "docker"): DockerExec {
  return (args, options) =>
    new Promise<DockerCommandResult>((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        // detached：子进程成为进程组组长，abort 时可杀整个进程组。
        // SANDBOX_DOCKER_BINARY 可能是包装脚本（如 sudo -n docker）：只杀包装进程会留下
        // 孤儿 docker 客户端继续持有 stdio 管道，导致 abort/硬超时无法立即生效。
        child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
      } catch (error) {
        resolve({ stdout: "", stderr: "", code: null, signal: null, timedOut: false, error: error as Error });
        return;
      }

      const stdout = createCollector(DOCKER_OUTPUT_LIMIT_BYTES);
      const stderr = createCollector(DOCKER_OUTPUT_LIMIT_BYTES);
      let timedOut = false;
      let settled = false;
      let hardTimer: NodeJS.Timeout | undefined;

      const abort = () => {
        timedOut = true;
        // 尽力杀整个进程组：SANDBOX_DOCKER_BINARY 可能是 sudo 包装，sudo 会把 docker
        // 客户端放到新的会话/进程组，杀包装进程不一定能杀到它（孤儿会继续持有 stdio 管道）。
        // 因此无论如何都立即销毁 stdio 并 settle，避免 promise 一直等待孤儿进程关闭管道；
        // 调用方随后会对容器执行 kill/inspect，孤儿 docker wait 会在容器被终止后自行退出。
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            /* 组杀失败，退回杀直接子进程 */
          }
        }
        try {
          child.kill("SIGKILL");
        } catch {
          /* 进程可能已退出 */
        }
        child.stdout?.destroy();
        child.stderr?.destroy();
        settle({ stdout: stdout.text, stderr: stderr.text, code: null, signal: "SIGKILL", timedOut: true });
      };
      const cleanup = () => {
        if (hardTimer) clearTimeout(hardTimer);
        options?.signal?.removeEventListener("abort", abort);
      };
      const settle = (result: DockerCommandResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      if (options?.timeoutMs !== undefined) hardTimer = setTimeout(abort, options.timeoutMs);
      if (options?.signal) {
        if (options.signal.aborted) {
          abort();
        } else {
          options.signal.addEventListener("abort", abort, { once: true });
        }
      }

      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        settle({ stdout: stdout.text, stderr: stderr.text, code: null, signal: null, timedOut, error });
      });
      child.on("close", (code, signal) => {
        settle({ stdout: stdout.text, stderr: stderr.text, code, signal, timedOut });
      });
    });
}
