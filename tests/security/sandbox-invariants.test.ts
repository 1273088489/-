// P2-07 沙箱不变量回归：容器参数必须始终带资源限制/无网络/只读，
// 伪造 docker 只发 CLI 子命令，绝无宿主执行学习者代码的路径。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runInSandbox } from "@/server/sandbox/runner";
import { SandboxConfigError } from "@/server/sandbox/errors";
import { shellQuote } from "@/server/runner/orchestrator";
import type { DockerCommandResult, DockerExec, DockerExecOptions } from "@/server/sandbox/docker";

function result(overrides: Partial<DockerCommandResult> = {}): DockerCommandResult {
  return { stdout: "", stderr: "", code: 0, signal: null, timedOut: false, ...overrides };
}
function fakeDocker(handlers: Record<string, () => Partial<DockerCommandResult>>): { exec: DockerExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec = vi.fn(async (args: string[], _options?: DockerExecOptions) => {
    calls.push(args);
    const handler = handlers[args[0]];
    if (!handler) return result({ code: 1, stderr: `unexpected ${args[0]}` });
    return result(handler());
  }) as unknown as DockerExec;
  return { exec, calls };
}
const defaultHandlers = {
  create: () => result({ stdout: "id\n" }),
  cp: () => result(),
  start: () => result(),
  wait: () => result({ stdout: "0\n" }),
  logs: () => result({ stdout: "" }),
  inspect: () => result({ stdout: "false 0 false\n" }),
  rm: () => result(),
  kill: () => result(),
};

describe("沙箱不变量（P2-07）", () => {
  it("create 参数始终包含 --network none / --memory / --cpus / --pids-limit / --read-only / cap-drop / no-new-privileges", async () => {
    const { exec, calls } = fakeDocker(defaultHandlers);
    await runInSandbox({ image: "node:24", cmd: ["node", "-e", "1"], docker: exec });
    const args = calls.find((call) => call[0] === "create")!;
    const joined = args.join(" ");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--memory ");
    expect(joined).toContain("--cpus ");
    expect(joined).toContain("--pids-limit ");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("no-new-privileges");
    expect(joined).toContain("--tmpfs /tmp:rw,noexec,nosuid");
    expect(joined).toContain("--workdir /workspace");
    expect(joined).toContain("-v /workspace");
    // 命令以 image 之后的 argv 传递，不经 shell
    expect(args.slice(args.indexOf("node:24"))).toEqual(["node:24", "node", "-e", "1"]);
  });

  it("docker CLI 调用只允许白名单子命令，绝不直接执行学习者命令", async () => {
    const { exec, calls } = fakeDocker(defaultHandlers);
    await runInSandbox({ image: "x", cmd: ["sh", "-c", "evil"], projectDir: fs.mkdtempSync(path.join(os.tmpdir(), "qz-invar-")), docker: exec });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => ["create", "cp", "start", "wait", "logs", "inspect", "kill", "rm", "pull"].includes(call[0]))).toBe(true);
  });

  it("shellQuote 转义可破坏引号的参数，防拼接注入", () => {
    expect(shellQuote("a; rm -rf /")).toBe("'a; rm -rf /'");
    expect(shellQuote("$(id)")).toBe("'$(id)'");
    expect(shellQuote("'")).toBe("''\\'''");
  });
});

describe("沙箱不变量（RB-01 copyDirs）", () => {
  function tempDirs(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "qz-invar-"));
  }

  const badContainerPaths = [
    "/etc",                     // 根路径（越出 workdir）
    "/workspace",               // 等于 workdir 本身
    "/workspace/../x",          // ../ 段
    "/workspace/..",            // ../ 段
    "/workspace/sub/../../etc", // 中间 ../ 段
    "/workspace/.hidden/../x",  // 中间 ../ 段
    "workspace/cache",          // 非绝对路径
    "/workspace/cache\nx",      // 换行
    "/workspace/cache\0x",      // NUL（JS 字符串允许含 \0）
    "/workspace/cache\u0001x",  // 控制字符
  ];

  it("恶意 containerPath（非绝对 / 越出 workdir / .. 段 / NUL/换行/控制字符）全部被拒为 SandboxConfigError", async () => {
    const exec = fakeDocker(defaultHandlers).exec;
    for (const containerPath of badContainerPaths) {
      const hostDir = tempDirs();
      await expect(
        runInSandbox({
          image: "x",
          cmd: ["true"],
          copyDirs: [{ hostPath: hostDir, containerPath }],
          docker: exec,
        }),
      ).rejects.toThrow(SandboxConfigError);
    }
  });

  it("hostPath 不存在或不是目录 → SandboxConfigError", async () => {
    const exec = fakeDocker(defaultHandlers).exec;
    await expect(
      runInSandbox({
        image: "x",
        cmd: ["true"],
        copyDirs: [{ hostPath: "/no/such/host/dir", containerPath: "/workspace/cache" }],
        docker: exec,
      }),
    ).rejects.toThrow(SandboxConfigError);
    const file = path.join(tempDirs(), "file.txt");
    fs.writeFileSync(file, "x");
    await expect(
      runInSandbox({
        image: "x",
        cmd: ["true"],
        copyDirs: [{ hostPath: file, containerPath: "/workspace/cache" }],
        docker: exec,
      }),
    ).rejects.toThrow(SandboxConfigError);
  });

  it("docker CLI 只调用白名单子命令（copyDirs 只新增 cp），create 参数资源限制不变", async () => {
    const { exec, calls } = fakeDocker(defaultHandlers);
    const hostDir = tempDirs();
    await runInSandbox({
      image: "node:24",
      cmd: ["node", "-e", "1"],
      projectDir: tempDirs(),
      copyDirs: [{ hostPath: hostDir, containerPath: "/workspace/.quanzhan-offline" }],
      docker: exec,
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => ["create", "cp", "start", "wait", "logs", "inspect", "kill", "rm", "pull"].includes(call[0]))).toBe(true);
    // 有 copyDirs 时应比无 copyDirs 多一次 cp
    const cpCount = calls.filter((call) => call[0] === "cp").length;
    expect(cpCount).toBe(2);

    const args = calls.find((call) => call[0] === "create")!;
    const joined = args.join(" ");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--memory ");
    expect(joined).toContain("--cpus ");
    expect(joined).toContain("--pids-limit ");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("no-new-privileges");
    expect(joined).toContain("--tmpfs /tmp:rw,noexec,nosuid");
    expect(joined).toContain("--workdir /workspace");
    expect(joined).toContain("-v /workspace");
  });
});
