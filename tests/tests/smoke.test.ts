// P2-04 真实沙箱 smoke：公开 node:test 与隐藏 static-check 在受限容器内执行，
// 隐藏运行只执行固定命令（不执行学习者脚本），隐藏内容不进入公开运行。
// Docker 或镜像不可用时整组跳过（环境受限）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runTestCaseInSandbox } from "@/server/tests/runner";
import { DEFAULT_SANDBOX_IMAGE } from "@/server/runner/config";
import { prepareTestWorkspace } from "@/server/tests/workspace";
import { dockerAvailable, imageAvailable } from "../helpers/docker";
import type { TestCasePlan } from "@/server/tests/types";

const SMOKE_IMAGE = process.env.SANDBOX_IMAGE ?? process.env.SANDBOX_SMOKE_IMAGE ?? DEFAULT_SANDBOX_IMAGE;

const canSmoke = dockerAvailable() && imageAvailable(SMOKE_IMAGE);

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-p2-04-smoke-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "learner",
      version: "1.0.0",
      scripts: { test: "echo LEARNER_SCRIPT_RAN", build: "echo LEARNER_BUILD_RAN" },
    }),
  );
fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "math.js"), "module.exports = { add: (a, b) => a + b };\n");
  return dir;
}

function caseRow(key: string, framework: "node:test" | "static-check", files: Record<string, string>, kind: "public" | "hidden") {
  return {
    id: key,
    key,
    kind,
    name: key,
    framework,
    files: JSON.stringify(files),
    command: "[]",
    orderIndex: 0,
  };
}

describe.skipIf(!canSmoke)(`P2-04 真实沙箱公开+隐藏测试（${SMOKE_IMAGE}）`, () => {
  it("公开 node:test 通过；隐藏 static-check 通过且不执行学习者脚本、不泄漏隐藏内容", async () => {
    const projectDir = makeProject();
    const hiddenMarker = "P2_04_HIDDEN_SMOKE_MARKER";
    try {
      const publicCase = caseRow("public-sum", "node:test", {
        "public-sum.test.js": [
          "const test = require('node:test');",
          "const assert = require('node:assert');",
          "const { add } = require('../src/math.js');",
          "test('adds', () => assert.equal(add(1, 2), 3));",
        ].join("\n"),
      }, "public");
      const hiddenCase = caseRow("hidden-static", "static-check", {
        "check.mjs": [
          "import fs from 'node:fs';",
          "import path from 'node:path';",
          "const root = process.cwd();",
          `const marker = '${hiddenMarker}';`,
          "const src = fs.readFileSync(path.join(root, 'src/math.js'), 'utf8');",
          "if (!src.includes('add')) { console.log('FAIL: math.js 缺少 add'); process.exit(1); }",
          "console.log('PASS: 隐藏静态检查通过');",
        ].join("\n"),
      }, "hidden");

      // 公开工作区绝不包含隐藏测试内容
      const publicPlan: TestCasePlan = {
        key: publicCase.key, name: publicCase.name, kind: "public", framework: "node:test",
        files: { "public-sum.test.js": "test" }, command: [], entryFile: "public-sum.test.js",
      };
      const publicWs = prepareTestWorkspace(projectDir, publicPlan);
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
        expect(walk(publicWs.workspaceDir).join("\n")).not.toContain(hiddenMarker);
      } finally {
        publicWs.cleanup();
      }

      const baseConfig = { runtime: "node" as const, image: SMOKE_IMAGE, timeoutMs: 120_000, memoryMb: 512, env: {} };
      const publicExecution = await runTestCaseInSandbox({ projectDir, testCase: publicCase, baseConfig });
      expect(publicExecution.outcome.status).toBe("success");
      expect(publicExecution.result.passed).toBe(true);
      expect(publicExecution.result.counts).toMatchObject({ tests: 1, pass: 1, fail: 0 });
      // 公开运行输出中不允许出现隐藏标记
      expect(publicExecution.outcome.stdout).not.toContain(hiddenMarker);

      const hiddenExecution = await runTestCaseInSandbox({ projectDir, testCase: hiddenCase, baseConfig });
      expect(hiddenExecution.outcome.status).toBe("success");
      expect(hiddenExecution.result.passed).toBe(true);
      // 隐藏运行只执行固定命令：学习者 npm test/build 脚本绝不允许执行
      expect(hiddenExecution.outcome.stdout).not.toContain("LEARNER_SCRIPT_RAN");
      expect(hiddenExecution.outcome.stdout).not.toContain("LEARNER_BUILD_RAN");
      expect(hiddenExecution.outcome.stdout).toContain("隐藏静态检查通过");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }, 180_000);
});
