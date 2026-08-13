// 沙箱运行器单元测试：注入 fake docker 执行器，验证参数、执行流、错误分类与降级策略。
// 真实容器验证见 smoke.test.ts。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCreateArgs, generateContainerName, runInSandbox } from "@/server/sandbox/runner";
import { SandboxConfigError } from "@/server/sandbox/errors";
import type { DockerCommandResult, DockerExec, DockerExecOptions } from "@/server/sandbox/docker";

type Handler = (args: string[], options?: DockerExecOptions) => Partial<DockerCommandResult> | Promise<Partial<DockerCommandResult>>;

function result(overrides: Partial<DockerCommandResult> = {}): DockerCommandResult {
  return { stdout: "", stderr: "", code: 0, signal: null, timedOut: false, ...overrides };
}

/** 记录所有调用并按子命令分发结果的 fake docker。 */
function fakeDocker(handlers: Record<string, Handler>): { exec: DockerExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec = vi.fn(async (args: string[], options?: DockerExecOptions) => {
    calls.push(args);
    const handler = handlers[args[0]];
    if (!handler) return result({ code: 1, stderr: `unexpected docker command: ${args[0]}` });
    return result(await handler(args, options));
  }) as unknown as DockerExec & { mock: { calls: unknown[][] } };
  return { exec, calls };
}

const defaultHandlers: Record<string, Handler> = {
  create: () => result({ stdout: "container-id\n" }),
  cp: () => result(),
  start: () => result(),
  wait: () => result({ stdout: "0\n" }),
  logs: () => result({ stdout: "hello\n" }),
  inspect: () => result({ stdout: "false 0 false\n" }),
  rm: () => result(),
  kill: () => result(),
  pull: () => result(),
};

describe("runInSandbox 参数与容器限制", () => {
  it("create 参数包含资源限制、只读、无网络、可写工作目录与默认 HOME", async () => {
    const { exec, calls } = fakeDocker({ ...defaultHandlers });
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-unit-"));
    const resultRun = await runInSandbox({
      image: "node:24-bookworm-slim",
      cmd: ["node", "-e", "console.log(1)"],
      projectDir,
      env: { NODE_ENV: "test" },
      docker: exec,
    });

    expect(resultRun.status).toBe("success");
    expect(resultRun.exitCode).toBe(0);
    expect(resultRun.stdout).toContain("hello");

    const createArgs = calls.find((args) => args[0] === "create");
    expect(createArgs).toBeDefined();
    const args = createArgs!;
    expect(args).toContain("--network");
    expect(args[args.indexOf("--network") + 1]).toBe("none");
    expect(args).toContain("--memory");
    expect(args[args.indexOf("--memory") + 1]).toBe("512m");
    expect(args).toContain("--cpus");
    expect(args[args.indexOf("--cpus") + 1]).toBe("1");
    expect(args).toContain("--pids-limit");
    expect(args[args.indexOf("--pids-limit") + 1]).toBe("64");
    expect(args).toContain("--read-only");
    expect(args).toContain("--tmpfs");
    expect(args[args.indexOf("--tmpfs") + 1]).toContain("/tmp:rw,noexec,nosuid");
    expect(args).toContain("--security-opt");
    expect(args).toContain("--cap-drop");
    expect(args).toContain("--workdir");
    expect(args[args.indexOf("--workdir") + 1]).toBe("/workspace");
    expect(args).toContain("-v");
    expect(args[args.indexOf("-v") + 1]).toBe("/workspace");
    expect(args).toContain("--env");
    expect(args).toContain("HOME=/tmp");
    expect(args).toContain("NODE_ENV=test");
    expect(args.slice(args.indexOf("--name") + 1, args.indexOf("--name") + 2)).toEqual([expect.stringMatching(/^quanzhan-sandbox-/)]);
    expect(args).toContain("node:24-bookworm-slim");
    expect(args.slice(-3)).toEqual(["node", "-e", "console.log(1)"]);

    // 项目经 docker cp 复制进沙箱（无宿主挂载）
    expect(calls.some((call) => call[0] === "cp" && call[1].startsWith(path.resolve(projectDir)) && call[2].endsWith(":/workspace"))).toBe(true);
    // 清理阶段移除容器与匿名卷
    expect(calls.some((call) => call[0] === "rm" && call.includes("-v"))).toBe(true);
  });

  it("entrypoint 可覆盖镜像默认入口", async () => {
    const { exec, calls } = fakeDocker({ ...defaultHandlers });
    await runInSandbox({ image: "app:local", cmd: ["node", "-v"], entrypoint: "", docker: exec });
    const createArgs = calls.find((args) => args[0] === "create")!;
    expect(createArgs).toContain("--entrypoint");
    expect(createArgs[createArgs.indexOf("--entrypoint") + 1]).toBe("");
  });

  it("参数校验：空 cmd / 非法 env key / 不存在的 projectDir 抛 SandboxConfigError", async () => {
    const exec = fakeDocker({ ...defaultHandlers }).exec;
    await expect(runInSandbox({ image: "x", cmd: [], docker: exec })).rejects.toThrow(SandboxConfigError);
    await expect(runInSandbox({ image: "x", cmd: ["true"], env: { "BAD KEY": "1" }, docker: exec })).rejects.toThrow(SandboxConfigError);
    await expect(runInSandbox({ image: "x", cmd: ["true"], projectDir: "/no/such/dir", docker: exec })).rejects.toThrow(SandboxConfigError);
  });

  it("generateContainerName 生成合法且带前缀的名称", () => {
    expect(generateContainerName()).toMatch(/^quanzhan-sandbox-[a-z0-9-]+$/);
    expect(generateContainerName()).not.toBe(generateContainerName());
  });

  it("buildCreateArgs 按配置生成参数（自定义限额）", () => {
    const args = buildCreateArgs({
      image: "node:24-bookworm-slim",
      cmd: ["npm", "test"],
      containerName: "name-1",
      network: "none",
      memoryMb: 256,
      cpus: 0.5,
      pidsLimit: 32,
      readOnly: true,
      workdir: "/app",
      tmpfsMb: 128,
      env: { HOME: "/tmp" },
      entrypoint: "",
    });
    expect(args).toEqual([
      "create", "--network", "none", "--memory", "256m", "--cpus", "0.5", "--pids-limit", "32",
      "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL", "--workdir", "/app", "-v", "/app", "--entrypoint", "", "--name", "name-1",
      "--env", "HOME=/tmp", "node:24-bookworm-slim", "npm", "test",
    ]);
  });
});

describe("runInSandbox 错误分类与降级", () => {
  it("Docker 不可达 → infra-unavailable，绝不回退宿主执行", async () => {
    const { exec, calls } = fakeDocker({
      create: () => result({ code: 1, stderr: "Cannot connect to the Docker daemon. Is the docker daemon running?" }),
    });
    const outcome = await runInSandbox({ image: "node:24-bookworm-slim", cmd: ["node", "-e", "1"], docker: exec });
    expect(outcome.status).toBe("infra-unavailable");
    expect(outcome.message).toContain("沙箱不可用");
    expect(outcome.exitCode).toBeNull();
    // 所有调用都是 docker CLI 子命令，绝无直接执行学习者命令的路径
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((args) => ["create", "cp", "start", "wait", "logs", "inspect", "kill", "rm", "pull"].includes(args[0]))).toBe(true);
  });

  it("镜像缺失且 pullImage=false → infra-unavailable 且提示镜像", async () => {
    const { exec, calls } = fakeDocker({
      create: () => result({ code: 1, stderr: "Unable to find image 'node:24-bookworm-slim' locally" }),
    });
    const outcome = await runInSandbox({ image: "node:24-bookworm-slim", cmd: ["true"], docker: exec });
    expect(outcome.status).toBe("infra-unavailable");
    expect(outcome.message).toContain("镜像");
    expect(calls.some((args) => args[0] === "pull")).toBe(false);
  });

  it("镜像缺失且 pullImage=true → 先 pull 再重建容器", async () => {
    let createCount = 0;
    const { exec, calls } = fakeDocker({
      ...defaultHandlers,
      create: () => {
        createCount += 1;
        return createCount === 1 ? result({ code: 1, stderr: "Unable to find image 'x' locally" }) : result({ stdout: "id\n" });
      },
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["true"], pullImage: true, docker: exec });
    expect(outcome.status).toBe("success");
    expect(calls.filter((args) => args[0] === "pull")).toHaveLength(1);
    expect(calls.filter((args) => args[0] === "create")).toHaveLength(2);
  });

  it("OOM：inspect 标记 OOMKilled → oom", async () => {
    const { exec } = fakeDocker({
      ...defaultHandlers,
      inspect: () => result({ stdout: "false 137 true\n" }),
      logs: () => result({ stdout: "", stderr: "" }),
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["true"], docker: exec });
    expect(outcome.status).toBe("oom");
    expect(outcome.oomKilled).toBe(true);
    expect(outcome.exitCode).toBe(137);
    expect(outcome.message).toContain("OOM");
  });

  it("网络被禁：容器 stderr 含网络特征 → network-blocked", async () => {
    const { exec } = fakeDocker({
      ...defaultHandlers,
      inspect: () => result({ stdout: "false 42 false\n" }),
      logs: () => result({ stdout: "", stderr: "NETERR: fetch failed" }),
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["node", "x.js"], docker: exec });
    expect(outcome.status).toBe("network-blocked");
    expect(outcome.message).toContain("网络");
  });

  it("普通非零退出 → runtime-error", async () => {
    const { exec } = fakeDocker({
      ...defaultHandlers,
      inspect: () => result({ stdout: "false 7 false\n" }),
      logs: () => result({ stdout: "", stderr: "boom" }),
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["false"], docker: exec });
    expect(outcome.status).toBe("runtime-error");
    expect(outcome.exitCode).toBe(7);
    expect(outcome.message).toContain("退出码 7");
  });

  it("超时：wait 被中止 → 杀容器并返回 timeout", async () => {
    const { exec, calls } = fakeDocker({
      ...defaultHandlers,
      wait: (_args, options) =>
        new Promise<Partial<DockerCommandResult>>((resolve) => {
          const finish = () => resolve(result({ code: null, signal: "SIGKILL", timedOut: true }));
          if (options?.signal?.aborted) {
            finish();
            return;
          }
          options?.signal?.addEventListener("abort", finish, { once: true });
        }),
      inspect: () => result({ stdout: "true 0 false\n" }), // 容器仍在运行 → 确认超时
      logs: () => result({ stdout: "partial", stderr: "" }),
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["sleep", "30"], timeoutMs: 100, docker: exec });
    expect(outcome.status).toBe("timeout");
    expect(outcome.timedOut).toBe(true);
    expect(outcome.message).toContain("超时");
    expect(calls.some((args) => args[0] === "kill")).toBe(true);
    expect(calls.some((args) => args[0] === "rm" && args.includes("-v"))).toBe(true);
  });

  it("超时竞态：中止瞬间容器已退出 → 不误判超时", async () => {
    const { exec } = fakeDocker({
      ...defaultHandlers,
      wait: (_args, options) =>
        new Promise<Partial<DockerCommandResult>>((resolve) => {
          const finish = () => resolve(result({ code: null, signal: "SIGKILL", timedOut: true }));
          if (options?.signal?.aborted) {
            finish();
            return;
          }
          options?.signal?.addEventListener("abort", finish, { once: true });
        }),
      inspect: () => result({ stdout: "false 3 false\n" }), // 已退出 → 不算超时
      logs: () => result({ stdout: "", stderr: "err" }),
    });
    const outcome = await runInSandbox({ image: "x", cmd: ["sh", "-c", "exit 3"], timeoutMs: 100, docker: exec });
    expect(outcome.status).toBe("runtime-error");
    expect(outcome.timedOut).toBe(false);
    expect(outcome.exitCode).toBe(3);
  });
});



describe("runInSandbox copyDirs（RB-01）", () => {
  it("projectDir 复制后、start 前逐项 docker cp 到容器内 workdir 子路径，其余流程不变", async () => {
    const { exec, calls } = fakeDocker({ ...defaultHandlers });
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-unit-"));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-cache-"));
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-other-"));

    const outcome = await runInSandbox({
      image: "node:24-bookworm-slim",
      cmd: ["npm", "test"],
      projectDir,
      copyDirs: [
        { hostPath: cacheDir, containerPath: "/workspace/.quanzhan-offline" },
        { hostPath: otherDir, containerPath: "/workspace/.quanzhan-tools" },
      ],
      docker: exec,
    });

    expect(outcome.status).toBe("success");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain("hello");

    const cpCalls = calls.filter((args) => args[0] === "cp");
    expect(cpCalls).toHaveLength(3);
    // 1) projectDir 内容 → /workspace
    expect(cpCalls[0][1]).toBe(`${path.resolve(projectDir)}/.`);
    expect(cpCalls[0][2]).toMatch(/^quanzhan-sandbox-.*:\/workspace$/);
    // 2) copyDirs 各宿主目录内容 → workdir 内目标，顺序与传入一致
    expect(cpCalls[1][1]).toBe(`${path.resolve(cacheDir)}/.`);
    expect(cpCalls[1][2]).toMatch(/^quanzhan-sandbox-.*:\/workspace\/\.quanzhan-offline$/);
    expect(cpCalls[2][1]).toBe(`${path.resolve(otherDir)}/.`);
    expect(cpCalls[2][2]).toMatch(/^quanzhan-sandbox-.*:\/workspace\/\.quanzhan-tools$/);

    // 顺序：create → cp(projectDir) → cp(copyDirs) → start → …（docker cp 全部先于 start）
    const createIdx = calls.findIndex((args) => args[0] === "create");
    const startIdx = calls.findIndex((args) => args[0] === "start");
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(createIdx);
    for (const cp of cpCalls) {
      expect(calls.indexOf(cp)).toBeGreaterThan(createIdx);
      expect(calls.indexOf(cp)).toBeLessThan(startIdx);
    }
    // 既有 create 限制不变量不因 copyDirs 而改变
    const createArgs = calls.find((args) => args[0] === "create")!;
    const joined = createArgs.join(" ");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("no-new-privileges");
  });

  it("copyDirs 中某项 docker cp 失败 → infra-unavailable，不启动容器", async () => {
    const { exec, calls } = fakeDocker({
      ...defaultHandlers,
      cp: (args) => {
        // 仅对额外的副本目录 cp 失败（projectDir 复制仍成功）
        if (args[1] !== path.resolve(".") && args[2].includes(".quanzhan-offline")) {
          return result({ code: 1, stderr: "Error response from daemon: no such directory" });
        }
        return result();
      },
    });
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-unit-"));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-cache-"));

    const outcome = await runInSandbox({
      image: "node:24-bookworm-slim",
      cmd: ["npm", "test"],
      projectDir,
      copyDirs: [{ hostPath: cacheDir, containerPath: "/workspace/.quanzhan-offline" }],
      docker: exec,
    });

    expect(outcome.status).toBe("infra-unavailable");
    expect(outcome.message).toContain("复制");
    expect(outcome.message).toContain(".quanzhan-offline");
    // 未执行 start/学习者命令
    expect(calls.some((args) => args[0] === "start")).toBe(false);
    expect(calls.filter((args) => args[0] === "cp")).toHaveLength(2);
    // 清理仍执行（rm 容器与匿名卷）
    expect(calls.some((args) => args[0] === "rm" && args.includes("-v"))).toBe(true);
  });
});
