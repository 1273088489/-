// P2-03 编排器单元测试：注入 fake docker，验证阶段脚本、输出解析与错误分类。
// 真实容器验证见 execution.test.ts（Docker 可用时运行）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildPhaseScript,
  parsePhaseResults,
  runProjectInSandbox,
  shellQuote,
  stripPhaseMarkers,
} from "@/server/runner/orchestrator";
import type { DockerCommandResult, DockerExec, DockerExecOptions } from "@/server/sandbox";
import type { SandboxPhase } from "@/server/runner/types";

type Handler = (args: string[], options?: DockerExecOptions) => Partial<DockerCommandResult> | Promise<Partial<DockerCommandResult>>;

function result(overrides: Partial<DockerCommandResult> = {}): DockerCommandResult {
  return { stdout: "", stderr: "", code: 0, signal: null, timedOut: false, ...overrides };
}

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
  logs: () => result(),
  inspect: () => result({ stdout: "false 0 false\n" }),
  rm: () => result(),
  kill: () => result(),
  pull: () => result(),
};

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-orchestrator-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

const successLogs = [
  "__QZ_PHASE_START__:install",
  "__QZ_PHASE_STDOUT__:install",
  "added 1 package",
  "__QZ_PHASE_STDERR__:install",
  "",
  "__QZ_PHASE_EXIT__:install:0:120",
  "__QZ_PHASE_START__:test",
  "__QZ_PHASE_STDOUT__:test",
  "1..1",
  "ok 1",
  "__QZ_PHASE_STDERR__:test",
  "",
  "__QZ_PHASE_EXIT__:test:0:80",
  "__QZ_DONE__",
].join("\n");

describe("buildPhaseScript / shellQuote", () => {
  it("生成 fail-fast 脚本：阶段命令被引用、最终退出码为失败阶段码", () => {
    const script = buildPhaseScript([
      { id: "install", label: "安装依赖", cmd: ["npm", "ci", "--no-audit", "--no-fund"] },
      { id: "test", label: "测试", cmd: ["npm", "test"] },
    ]);
    expect(script).toContain('echo "__QZ_PHASE_START__:$id"');
    expect(script).toContain('"$@" >"/tmp/qz-${id}.out" 2>"/tmp/qz-${id}.err"');
    expect(script).toContain('if [ "$qz_status" -eq 0 ]; then qz_run install npm ci --no-audit --no-fund || qz_status=$?; fi');
    expect(script).toContain('if [ "$qz_status" -eq 0 ]; then qz_run test npm test || qz_status=$?; fi');
    expect(script).toContain('exit "$qz_status"');
  });

  it("shellQuote 对含特殊字符的参数做单引号转义", () => {
    expect(shellQuote("npm")).toBe("npm");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe("parsePhaseResults / stripPhaseMarkers", () => {
  it("按标记拆分阶段 stdout/stderr/退出码/耗时", () => {
    const phases: SandboxPhase[] = [
      { id: "install", label: "安装依赖", cmd: ["npm", "ci"] },
      { id: "build", label: "构建", cmd: [], skipped: true },
      { id: "test", label: "测试", cmd: ["npm", "test"] },
    ];
    const results = parsePhaseResults(successLogs, phases);
    expect(results[0]).toMatchObject({ phase: "install", exitCode: 0, durationMs: 120, stdout: "added 1 package", stderr: "" });
    expect(results[1]).toMatchObject({ phase: "build", skipped: true, exitCode: null });
    expect(results[2]).toMatchObject({ phase: "test", exitCode: 0, durationMs: 80, stdout: "1..1\nok 1" });
  });

  it("stripPhaseMarkers 去掉标记行，保留阶段输出", () => {
    const clean = stripPhaseMarkers(successLogs);
    expect(clean).not.toContain("__QZ_PHASE_");
    expect(clean).toContain("added 1 package");
    expect(clean).toContain("ok 1");
  });
});

describe("runProjectInSandbox", () => {
  it("node 项目成功：单容器脚本执行，收集阶段证据与整体结果", async () => {
    const projectDir = makeProject({
      "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
      "package-lock.json": "{}",
    });
    const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: successLogs }) });
    const outcome = await runProjectInSandbox({
      projectDir,
      config: { runtime: "node", timeoutMs: 30_000, memoryMb: 256, env: { NODE_ENV: "test" } },
      docker: exec,
    });

    expect(outcome.status).toBe("success");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.runtime).toBe("node");
    expect(outcome.phases.map((p) => p.phase)).toEqual(["install", "build", "test"]);
    expect(outcome.phases[1]).toMatchObject({ phase: "build", skipped: true, exitCode: null });
    expect(outcome.phases[2]).toMatchObject({ phase: "test", exitCode: 0, stdout: "1..1\nok 1" });
    expect(outcome.stdout).toContain("added 1 package");
    expect(outcome.timedOut).toBe(false);

    const createArgs = calls.find((args) => args[0] === "create")!;
    expect(createArgs).toContain("node:24-bookworm-slim");
    expect(createArgs[createArgs.indexOf("--entrypoint") + 1]).toBe("");
    // 命令以脚本方式进入容器（不经调用方 shell，由编排器安全拼接）
    const cmdIndex = createArgs.indexOf("node:24-bookworm-slim");
    expect(createArgs.slice(cmdIndex + 1)).toEqual(["sh", "-c", expect.stringContaining("qz_run install npm ci --no-audit --no-fund")]);
    expect(createArgs).toContain("--memory");
    expect(createArgs[createArgs.indexOf("--memory") + 1]).toBe("256m");
    expect(createArgs).toContain("NODE_ENV=test");
    expect(calls.some((call) => call[0] === "cp" && call[1].startsWith(path.resolve(projectDir)))).toBe(true);
  });

  it("测试阶段失败：整体 runtime-error，failing phase 被标记", async () => {
    const projectDir = makeProject({
      "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
      "package-lock.json": "{}",
    });
    const logs = [
      "__QZ_PHASE_START__:install",
      "__QZ_PHASE_STDOUT__:install",
      "added 1 package",
      "__QZ_PHASE_STDERR__:install",
      "",
      "__QZ_PHASE_EXIT__:install:0:100",
      "__QZ_PHASE_START__:test",
      "__QZ_PHASE_STDOUT__:test",
      "not ok 1 - broken",
      "__QZ_PHASE_STDERR__:test",
      "Error: boom",
      "__QZ_PHASE_EXIT__:test:1:50",
      "__QZ_DONE__",
    ].join("\n");
    const { exec } = fakeDocker({
      ...defaultHandlers,
      logs: () => result({ stdout: logs }),
      inspect: () => result({ stdout: "false 1 false\n" }),
      wait: () => result({ stdout: "1\n" }),
    });
    const outcome = await runProjectInSandbox({ projectDir, config: {}, docker: exec });

    expect(outcome.status).toBe("runtime-error");
    expect(outcome.exitCode).toBe(1);
    expect(outcome.phases[2]).toMatchObject({ phase: "test", exitCode: 1, stderr: "Error: boom" });
    expect(outcome.message).toContain("测试失败");
  });

  it("超时：status=timeout", async () => {
    const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
    const { exec } = fakeDocker({
      ...defaultHandlers,
      wait: () => result({ timedOut: true, code: null }),
      inspect: () => result({ stdout: "true 0 false\n" }),
    });
    const outcome = await runProjectInSandbox({ projectDir, config: { timeoutMs: 1000 }, docker: exec });
    expect(outcome.status).toBe("timeout");
    expect(outcome.timedOut).toBe(true);
  });

  it("网络被禁：npm 依赖下载失败分类为 network-blocked", async () => {
    const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
    const logs = [
      "__QZ_PHASE_START__:install",
      "__QZ_PHASE_STDOUT__:install",
      "",
      "__QZ_PHASE_STDERR__:install",
      "npm ERR! code ENETUNREACH",
      "npm ERR! errno ENETUNREACH",
      "npm ERR! network request to https://registry.npmjs.org failed",
      "__QZ_PHASE_EXIT__:install:1:5000",
      "__QZ_DONE__",
    ].join("\n");
    const { exec } = fakeDocker({
      ...defaultHandlers,
      logs: () => result({ stdout: logs }),
      inspect: () => result({ stdout: "false 1 false\n" }),
      wait: () => result({ stdout: "1\n" }),
    });
    const outcome = await runProjectInSandbox({ projectDir, config: {}, docker: exec });
    expect(outcome.status).toBe("network-blocked");
    expect(outcome.message).toContain("网络");
  });

  it("Docker 不可用：create 失败 → infra-unavailable，不执行宿主回退", async () => {
    const projectDir = makeProject({ "package.json": "{}" });
    const { exec } = fakeDocker({
      create: () => result({ code: 1, stderr: "Cannot connect to the Docker daemon" }),
    });
    const outcome = await runProjectInSandbox({ projectDir, config: {}, docker: exec });
    expect(outcome.status).toBe("infra-unavailable");
    expect(outcome.message).toContain("Docker");
    // 没有执行任何容器命令
    expect(outcome.phases.every((p) => p.exitCode === null)).toBe(true);
  });

  it("static 项目：verify 阶段执行并成功", async () => {
    const projectDir = makeProject({ "index.html": "<h1>ok</h1>" });
    const logs = [
      "__QZ_PHASE_START__:verify",
      "__QZ_PHASE_STDOUT__:verify",
      "STATIC_VERIFY files=1",
      "__QZ_PHASE_STDERR__:verify",
      "",
      "__QZ_PHASE_EXIT__:verify:0:5",
      "__QZ_DONE__",
    ].join("\n");
    const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: logs }) });
    const outcome = await runProjectInSandbox({ projectDir, config: {}, docker: exec });
    expect(outcome.runtime).toBe("static");
    expect(outcome.status).toBe("success");
    expect(outcome.phases[0]).toMatchObject({ phase: "verify", exitCode: 0, stdout: "STATIC_VERIFY files=1" });
    const createArgs = calls.find((args) => args[0] === "create")!;
    expect(JSON.stringify(createArgs)).toContain("STATIC_VERIFY");
  });

  it("全部阶段跳过：不启动容器，直接成功", async () => {
    const projectDir = makeProject({ "package.json": "{}" });
    const { exec, calls } = fakeDocker({ ...defaultHandlers });
    const outcome = await runProjectInSandbox({
      projectDir,
      config: { runtime: "node", install: null, build: null, test: null },
      docker: exec,
    });
    expect(outcome.status).toBe("success");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.phases.every((p) => p.skipped)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  describe("npm 离线缓存（RB-02）", () => {
    function makeCacheDir(): { hostDir: string; containerPath: string } {
      const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-offline-cache-"));
      fs.writeFileSync(path.join(hostDir, "cache-item"), "x");
      return { hostDir, containerPath: "/workspace/.quanzhan-offline" };
    }

    function containerNameOf(calls: string[][]): string {
      const createArgs = calls.find((args) => args[0] === "create")!;
      return createArgs[createArgs.indexOf("--name") + 1];
    }

    it("缓存可用：install 命令含 --offline --cache，缓存经 docker cp 复制，env 合并 npm 离线配置，安全不变量保持", async () => {
      const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
      const cache = makeCacheDir();
      const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: successLogs }) });
      const outcome = await runProjectInSandbox({ projectDir, config: {}, offlineCache: cache, docker: exec });

      expect(outcome.status).toBe("success");
      const createArgs = calls.find((args) => args[0] === "create")!;
      const cmdIndex = createArgs.indexOf("node:24-bookworm-slim");
      expect(createArgs.slice(cmdIndex + 1)).toEqual([
        "sh",
        "-c",
        expect.stringContaining("qz_run install npm ci --no-audit --no-fund --offline --cache /workspace/.quanzhan-offline"),
      ]);
      expect(createArgs).toContain("npm_config_offline=true");
      expect(createArgs).toContain("npm_config_cache=/workspace/.quanzhan-offline");
      expect(createArgs).toContain("npm_config_prefer_offline=true");

      // 既有 create 安全不变量仍成立
      const joined = createArgs.join(" ");
      expect(joined).toContain("--network none");
      expect(joined).toContain("--memory ");
      expect(joined).toContain("--cpus ");
      expect(joined).toContain("--pids-limit ");
      expect(joined).toContain("--read-only");
      expect(joined).toContain("--cap-drop ALL");
      expect(joined).toContain("no-new-privileges");

      // docker cp：projectDir 一次 + 缓存一次，缓存 cp 在 start 之前
      const containerName = containerNameOf(calls);
      const cpCalls = calls.filter((call) => call[0] === "cp");
      expect(cpCalls.map((call) => call[2])).toEqual([
        `${containerName}:/workspace`,
        `${containerName}:/workspace/.quanzhan-offline`,
      ]);
      expect(cpCalls[1][1]).toBe(`${path.resolve(cache.hostDir)}/.`);
      const cacheCpIndex = calls.findIndex((call) => call[0] === "cp" && call[2] === `${containerName}:/workspace/.quanzhan-offline`);
      expect(calls.findIndex((call) => call[0] === "start")).toBeGreaterThan(cacheCpIndex);
    });

    it("缓存不可用（空目录）：install 命令不含 --offline，无额外 cp，create 不含 npm 离线 env", async () => {
      const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-offline-cache-"));
      const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: successLogs }) });
      const outcome = await runProjectInSandbox({
        projectDir,
        config: {},
        offlineCache: { hostDir: emptyDir, containerPath: "/workspace/.quanzhan-offline" },
        docker: exec,
      });

      expect(outcome.status).toBe("success");
      const createArgs = calls.find((args) => args[0] === "create")!;
      expect(createArgs.join(" ")).not.toContain("--offline");
      expect(createArgs).not.toContain("npm_config_offline");
      expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
    });

    it("缓存缺失：npm 触网失败仍分类为 network-blocked", async () => {
      const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
      const logs = [
        "__QZ_PHASE_START__:install",
        "__QZ_PHASE_STDOUT__:install",
        "",
        "__QZ_PHASE_STDERR__:install",
        "npm ERR! code ENETUNREACH",
        "npm ERR! errno ENETUNREACH",
        "npm ERR! network request to https://registry.npmjs.org failed",
        "__QZ_PHASE_EXIT__:install:1:5000",
        "__QZ_DONE__",
      ].join("\n");
      const { exec, calls } = fakeDocker({
        ...defaultHandlers,
        logs: () => result({ stdout: logs }),
        inspect: () => result({ stdout: "false 1 false\n" }),
        wait: () => result({ stdout: "1\n" }),
      });
      const outcome = await runProjectInSandbox({
        projectDir,
        config: {},
        offlineCache: { hostDir: "/no/such/cache/dir", containerPath: "/workspace/.quanzhan-offline" },
        docker: exec,
      });

      expect(outcome.status).toBe("network-blocked");
      expect(outcome.message).toContain("网络");
      const createArgs = calls.find((args) => args[0] === "create")!;
      expect(createArgs.join(" ")).not.toContain("--offline");
      expect(createArgs).not.toContain("npm_config_offline");
      expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
    });

    it("offlineCache=null（显式禁用）且 env 未设置：与现状一致（无 --offline、无额外 cp）", async () => {
      const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
      vi.stubEnv("SANDBOX_NPM_OFFLINE_CACHE", "");
      try {
        const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: successLogs }) });
        const outcome = await runProjectInSandbox({ projectDir, config: {}, offlineCache: null, docker: exec });
        expect(outcome.status).toBe("success");
        const createArgs = calls.find((args) => args[0] === "create")!;
        expect(createArgs.join(" ")).not.toContain("--offline");
        expect(createArgs).not.toContain("npm_config_offline");
        expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("env 未设置时 resolveNpmOfflineCache 返回 null → 不应用（不依赖真实 process.env）", async () => {
      const projectDir = makeProject({ "package.json": "{}", "package-lock.json": "{}" });
      vi.stubEnv("SANDBOX_NPM_OFFLINE_CACHE", "");
      try {
        const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: successLogs }) });
        const outcome = await runProjectInSandbox({ projectDir, config: {}, docker: exec });
        expect(outcome.status).toBe("success");
        const createArgs = calls.find((args) => args[0] === "create")!;
        expect(createArgs.join(" ")).not.toContain("--offline");
        expect(createArgs).not.toContain("npm_config_offline");
        expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("runtime=static：即使缓存可用也不应用", async () => {
      const projectDir = makeProject({ "index.html": "<h1>ok</h1>" });
      const cache = makeCacheDir();
      const logs = [
        "__QZ_PHASE_START__:verify",
        "__QZ_PHASE_STDOUT__:verify",
        "STATIC_VERIFY files=1",
        "__QZ_PHASE_STDERR__:verify",
        "",
        "__QZ_PHASE_EXIT__:verify:0:5",
        "__QZ_DONE__",
      ].join("\n");
      const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: logs }) });
      const outcome = await runProjectInSandbox({ projectDir, config: {}, offlineCache: cache, docker: exec });

      expect(outcome.runtime).toBe("static");
      expect(outcome.status).toBe("success");
      const createArgs = calls.find((args) => args[0] === "create")!;
      expect(createArgs.join(" ")).not.toContain("--offline");
      expect(createArgs).not.toContain("npm_config_offline");
      expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
    });

    it("install=null：即使缓存可用也不应用", async () => {
      const projectDir = makeProject({ "package.json": JSON.stringify({ scripts: { build: "echo build" } }) });
      const cache = makeCacheDir();
      const logs = [
        "__QZ_PHASE_START__:build",
        "__QZ_PHASE_STDOUT__:build",
        "build ok",
        "__QZ_PHASE_STDERR__:build",
        "",
        "__QZ_PHASE_EXIT__:build:0:10",
        "__QZ_DONE__",
      ].join("\n");
      const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: logs }) });
      const outcome = await runProjectInSandbox({
        projectDir,
        config: { install: null },
        offlineCache: cache,
        docker: exec,
      });

      expect(outcome.status).toBe("success");
      expect(outcome.phases.filter((p) => !p.skipped).map((p) => p.phase)).toEqual(["build"]);
      const createArgs = calls.find((args) => args[0] === "create")!;
      expect(createArgs.join(" ")).not.toContain("--offline");
      expect(createArgs).not.toContain("npm_config_offline");
      expect(calls.filter((call) => call[0] === "cp")).toHaveLength(1);
    });
  });

});
