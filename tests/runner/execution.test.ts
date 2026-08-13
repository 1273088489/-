// P2-03 真实沙箱执行 smoke：本机 Docker 与镜像可用时运行，否则整组跳过（环境受限）。
// 项目均为零依赖 Node 项目：--network=none 下 npm ci 无需触网即可完成。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProjectInSandbox } from "@/server/runner/orchestrator";
import { DEFAULT_SANDBOX_IMAGE } from "@/server/runner/config";
import { dockerAvailable, imageAvailable } from "../helpers/docker";

const SMOKE_IMAGE = process.env.SANDBOX_IMAGE ?? process.env.SANDBOX_SMOKE_IMAGE ?? DEFAULT_SANDBOX_IMAGE;

const canSmoke = dockerAvailable() && imageAvailable(SMOKE_IMAGE);

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-execution-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

const EMPTY_LOCKFILE = JSON.stringify({
  name: "min",
  version: "1.0.0",
  lockfileVersion: 3,
  requires: true,
  packages: { "": { name: "min", version: "1.0.0" } },
});

describe.skipIf(!canSmoke)(`P2-03 真实沙箱执行（${SMOKE_IMAGE}）`, () => {
  it("最小 Node 项目：npm ci + npm test 通过并收集阶段证据", async () => {
    const projectDir = makeProject({
      "package.json": JSON.stringify({ name: "min", version: "1.0.0", scripts: { test: "node --test" } }),
      "package-lock.json": EMPTY_LOCKFILE,
      "test/sample.test.js": 'const { test } = require("node:test");\nconst assert = require("node:assert");\ntest("adds", () => assert.equal(1 + 1, 2));\n',
    });
    try {
      const outcome = await runProjectInSandbox({
        projectDir,
        config: { runtime: "node", image: SMOKE_IMAGE, timeoutMs: 120_000 },
      });
      expect(outcome.status).toBe("success");
      expect(outcome.exitCode).toBe(0);
      expect(outcome.runtime).toBe("node");
      expect(outcome.phases.map((p) => p.phase)).toEqual(["install", "build", "test"]);
      expect(outcome.phases[0]).toMatchObject({ phase: "install", exitCode: 0 });
      expect(outcome.phases[1]).toMatchObject({ phase: "build", skipped: true, exitCode: null });
      expect(outcome.phases[2]).toMatchObject({ phase: "test", exitCode: 0 });
      expect(outcome.stdout).toContain("ok");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }, 180_000);

  it("测试红：整体 runtime-error 且失败阶段被标记", async () => {
    const projectDir = makeProject({
      "package.json": JSON.stringify({ name: "min", version: "1.0.0", scripts: { test: "node --test" } }),
      "package-lock.json": EMPTY_LOCKFILE,
      "test/broken.test.js": 'const { test } = require("node:test");\nconst assert = require("node:assert");\ntest("broken", () => assert.equal(1, 2));\n',
    });
    try {
      const outcome = await runProjectInSandbox({ projectDir, config: { runtime: "node", image: SMOKE_IMAGE, timeoutMs: 120_000 } });
      expect(outcome.status).toBe("runtime-error");
      expect(outcome.exitCode).not.toBe(0);
      expect(outcome.phases.find((p) => p.phase === "test")?.exitCode).not.toBe(0);
      expect(outcome.message).toContain("失败");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }, 180_000);

  it("static 项目：verify 阶段成功", async () => {
    const projectDir = makeProject({
      "index.html": "<h1>工单系统</h1>",
      "README.md": "# readme",
    });
    try {
      const outcome = await runProjectInSandbox({ projectDir, config: { runtime: "static", image: SMOKE_IMAGE, timeoutMs: 60_000 } });
      expect(outcome.status).toBe("success");
      expect(outcome.runtime).toBe("static");
      expect(outcome.phases[0]).toMatchObject({ phase: "verify", exitCode: 0 });
      expect(outcome.stdout).toContain("STATIC_VERIFY files=2");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }, 120_000);
});
