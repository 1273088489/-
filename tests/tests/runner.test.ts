// P2-04 测试执行器单元测试（注入 fake docker）：
// - 默认命令按框架生成；测试运行只执行固定命令，绝不执行学习者脚本；
// - 公开工作区不包含隐藏测试文件；隐藏文件位于随机点目录；
// - normalizeOutcome 对沙箱失败/退出码非 0 的处理。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultTestCommand, normalizeOutcome, runTestCaseInSandbox } from "@/server/tests/runner";
import { prepareTestWorkspace, assertSafeRelativePath } from "@/server/tests/workspace";
import { buildTestCasePlan } from "@/server/tests/runner";
import type { DockerCommandResult, DockerExec, DockerExecOptions } from "@/server/sandbox";
import type { TestCasePlan } from "@/server/tests/types";

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
  }) as unknown as DockerExec;
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
};

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-tests-run-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

const nodeTestLogs = [
  "__QZ_PHASE_START__:test",
  "__QZ_PHASE_STDOUT__:test",
  "TAP version 13",
  "ok 1 - adds",
  "1..1",
  "# tests 1",
  "# pass 1",
  "# fail 0",
  "# duration_ms 5",
  "__QZ_PHASE_STDERR__:test",
  "",
  "__QZ_PHASE_EXIT__:test:0:5",
  "__QZ_DONE__",
].join("\n");

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    key: "public-sum",
    kind: "public" as const,
    name: "求和",
    framework: "node:test" as const,
    files: JSON.stringify({ "sum.test.js": "const test = require('node:test');\n" }),
    command: "[]",
    orderIndex: 0,
    ...overrides,
  };
}

describe("buildTestCasePlan / defaultTestCommand", () => {
  it("按框架生成容器内命令（node:test / static-check / vitest / jest）", () => {
    const plan: TestCasePlan = {
      key: "k", name: "n", kind: "public", framework: "node:test",
      files: { "a.test.js": "" }, command: [], entryFile: "a.test.js",
    };
    expect(defaultTestCommand("node:test", ".quanzhan-tests-abc", "a.test.js")).toEqual(["node", "--test", ".quanzhan-tests-abc/a.test.js"]);
    expect(defaultTestCommand("static-check", ".quanzhan-tests-abc", "check.mjs")).toEqual(["node", ".quanzhan-tests-abc/check.mjs"]);
    expect(defaultTestCommand("vitest", ".quanzhan-tests-abc", "a.test.ts")).toEqual(["npx", "--no-install", "vitest", "run", ".quanzhan-tests-abc/a.test.ts"]);
    expect(defaultTestCommand("jest", ".quanzhan-tests-abc", "a.test.js")).toEqual(["npx", "--no-install", "jest", ".quanzhan-tests-abc/a.test.js"]);
  });

  it("buildTestCasePlan 以第一个文件为入口并解析 command 覆盖", () => {
    const plan = buildTestCasePlan(makeCase({ files: JSON.stringify({ "b.js": "1", "a.js": "2" }), command: JSON.stringify(["node", "custom.js"]) }));
    expect(plan.entryFile).toBe("b.js");
    expect(plan.command).toEqual(["node", "custom.js"]);
  });

  it("assertSafeRelativePath 拒绝绝对路径与 .. 逃逸", () => {
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow();
    expect(() => assertSafeRelativePath("a/../b")).toThrow();
    expect(assertSafeRelativePath("nested/check.mjs")).toBe("nested/check.mjs");
  });
});

describe("runTestCaseInSandbox", () => {
  it("node:test 用例：固定命令执行、解析结果、不运行学习者脚本", async () => {
    const projectDir = makeProject({
      "package.json": JSON.stringify({ name: "learner", scripts: { test: "echo LEAK-LEARNER-SCRIPT", build: "echo BUILD-LEARNER-SCRIPT" } }),
      "src/sum.js": "module.exports = (a, b) => a + b;\n",
    });
    const { exec, calls } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: nodeTestLogs }) });
    try {
      const execution = await runTestCaseInSandbox({
        projectDir,
        testCase: makeCase(),
        baseConfig: { timeoutMs: 60_000, memoryMb: 512, env: {} },
        docker: exec,
      });
      expect(execution.result.passed).toBe(true);
      expect(execution.result.durationMs).toBe(5);
      expect(execution.outcome.status).toBe("success");

      const createArgs = calls.find((args) => args[0] === "create")!;
      const script = createArgs[createArgs.length - 1];
      expect(script).toContain("node --test");
      expect(script).toContain(".quanzhan-tests-");
      // 安全：绝不执行学习者脚本
      expect(script).not.toContain("echo LEAK-LEARNER-SCRIPT");
      expect(script).not.toContain("npm test");
      expect(script).not.toContain("npm run build");
      const all = JSON.stringify(calls);
      expect(all).not.toContain("npm test");
      expect(all).not.toContain("npm run build");
      expect(all).not.toContain("echo LEAK");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("static-check 用例：退出码非 0 → 失败并保留消息", async () => {
    const projectDir = makeProject({ "index.html": "<h1>工单</h1>" });
    const failedLogs = [
      "__QZ_PHASE_START__:test",
      "__QZ_PHASE_STDOUT__:test",
      "FAIL: 缺少 README",
      "__QZ_PHASE_STDERR__:test",
      "",
      "__QZ_PHASE_EXIT__:test:1:7",
      "__QZ_DONE__",
    ].join("\n");
    const { exec } = fakeDocker({
      ...defaultHandlers,
      wait: () => result({ stdout: "1\n" }),
      logs: () => result({ stdout: failedLogs }),
      inspect: () => result({ stdout: "false 1 false\n" }),
    });
    try {
      const execution = await runTestCaseInSandbox({
        projectDir,
        testCase: makeCase({ framework: "static-check", files: JSON.stringify({ "check.mjs": "console.log('check')" }) }),
        baseConfig: { timeoutMs: 60_000, memoryMb: 512, env: {} },
        docker: exec,
      });
      expect(execution.result.passed).toBe(false);
      expect(execution.result.message).toContain("缺少 README");
      expect(execution.outcome.status).toBe("runtime-error");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("静态项目无需 package.json：自动注入最小 package.json 标记", async () => {
    const projectDir = makeProject({ "index.html": "<h1>工单</h1>" });
    const { exec } = fakeDocker({ ...defaultHandlers, logs: () => result({ stdout: nodeTestLogs }) });
    try {
      const execution = await runTestCaseInSandbox({
        projectDir,
        testCase: makeCase({ framework: "static-check", files: JSON.stringify({ "check.mjs": "console.log('ok')" }) }),
        baseConfig: { timeoutMs: 60_000, memoryMb: 512, env: {} },
        docker: exec,
      });
      // 工作区复制时会注入 package.json，planPhases 才能走 node 计划执行测试命令
      expect(execution.outcome.status).toBe("success");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe("prepareTestWorkspace（隐藏测试不泄漏）", () => {
  it("公开工作区不包含隐藏测试内容；隐藏文件位于随机点目录", () => {
    const projectDir = makeProject({ "index.html": "<h1>工单</h1>" });
    const hiddenMarker = "HIDDEN_SECRET_P2_04_MARKER";
    const publicPlan: TestCasePlan = {
      key: "pub", name: "公开", kind: "public", framework: "static-check",
      files: { "check.mjs": "console.log('public')" }, command: [], entryFile: "check.mjs",
    };
    const hiddenPlan: TestCasePlan = {
      key: "hid", name: "隐藏", kind: "hidden", framework: "static-check",
      files: { "check.mjs": hiddenMarker }, command: [], entryFile: "check.mjs",
    };
    const publicWs = prepareTestWorkspace(projectDir, publicPlan);
    const hiddenWs = prepareTestWorkspace(projectDir, hiddenPlan);
    try {
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) out.push(...walk(full));
          else out.push(fs.readFileSync(full, "utf8"));
        }
        return out;
      };
      const publicTexts = walk(publicWs.workspaceDir).join("\n");
      expect(publicTexts).not.toContain(hiddenMarker);
      expect(publicTexts).toContain("public");

      const hiddenTexts = walk(hiddenWs.workspaceDir).join("\n");
      expect(hiddenTexts).toContain(hiddenMarker);
      expect(hiddenWs.injectedDir.startsWith(".quanzhan-tests-")).toBe(true);
      expect(fs.existsSync(path.join(hiddenWs.workspaceDir, hiddenWs.injectedDir, "check.mjs"))).toBe(true);
      // 注入目录名随机，避免盲猜
      expect(hiddenWs.injectedDir).not.toBe(publicWs.injectedDir);
    } finally {
      publicWs.cleanup();
      hiddenWs.cleanup();
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe("normalizeOutcome", () => {
  it("沙箱错误（超时/基础设施）→ 失败并保留原因", () => {
    const outcome = {
      runtime: "node" as const,
      status: "infra-unavailable" as const,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      oomKilled: false,
      message: "沙箱不可用：Docker 未安装或守护进程不可达。",
      phases: [],
    };
    const result = normalizeOutcome(outcome, "node:test");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("沙箱不可用");
  });

  it("退出码非 0 但输出无失败标记时强制失败", () => {
    const outcome = {
      runtime: "node" as const,
      status: "success" as const,
      exitCode: 3,
      stdout: "ok 1 - a\n# tests 1\n# pass 1\n# fail 0",
      stderr: "",
      durationMs: 10,
      timedOut: false,
      oomKilled: false,
      phases: [],
    };
    const result = normalizeOutcome(outcome, "node:test");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("退出码非 0");
  });
});
