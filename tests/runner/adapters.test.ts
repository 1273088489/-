// P2-03 运行时适配器：结构检测与阶段计划（不执行仓库代码）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjectStructure, planPhases, readPackageJson } from "@/server/runner/adapters";
import type { ProjectSandboxConfig } from "@/server/runner/types";

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-adapter-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

describe("planPhases", () => {
  it("node 项目：npm ci（有 lockfile）+ build/test script 存在时纳入计划", () => {
    const dir = makeProject({
      "package.json": JSON.stringify({ scripts: { build: "vite build", test: "vitest run" } }),
      "package-lock.json": "{}",
    });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("node");
    expect(plan.phases.map((p) => p.id)).toEqual(["install", "build", "test"]);
    expect(plan.phases[0].cmd).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(plan.phases[1].cmd).toEqual(["npm", "run", "build"]);
    expect(plan.phases[2].cmd).toEqual(["npm", "test"]);
  });

  it("node 项目：无 lockfile 回退 npm install；无 script 阶段标记 skipped", () => {
    const dir = makeProject({ "package.json": JSON.stringify({}) });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("node");
    expect(plan.phases[0].cmd[0]).toBe("npm");
    expect(plan.phases[0].cmd[1]).toBe("install");
    expect(plan.phases[1].skipped).toBe(true);
    expect(plan.phases[2].skipped).toBe(true);
  });

  it("static 项目：无 package.json 自动检测并产出 verify 阶段", () => {
    const dir = makeProject({ "index.html": "<h1>ok</h1>" });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("static");
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].id).toBe("verify");
    expect(plan.phases[0].cmd[0]).toBe("node");
  });

  it("显式 runtime=static 覆盖结构检测", () => {
    const dir = makeProject({ "package.json": "{}" });
    const plan = planPhases(dir, { runtime: "static" } satisfies ProjectSandboxConfig);
    expect(plan.runtime).toBe("static");
    expect(plan.phases[0].id).toBe("verify");
  });

  it("显式 runtime=node 但无 package.json：按 static 兜底避免无意义 npm", () => {
    const dir = makeProject({ "README.md": "# x" });
    const plan = planPhases(dir, { runtime: "node" } satisfies ProjectSandboxConfig);
    expect(plan.runtime).toBe("static");
    expect(plan.phases[0].id).toBe("verify");
  });

  it("配置可覆盖 install/build/test 命令，null 表示跳过", () => {
    const dir = makeProject({ "package.json": JSON.stringify({ scripts: { build: "x" } }) });
    const plan = planPhases(dir, {
      runtime: "node",
      install: ["npm", "install", "--legacy-peer-deps"],
      build: null,
      test: ["node", "--test"],
    } satisfies ProjectSandboxConfig);
    expect(plan.phases.map((p) => p.id)).toEqual(["install", "test"]);
    expect(plan.phases[0].cmd).toEqual(["npm", "install", "--legacy-peer-deps"]);
    expect(plan.phases[1].cmd).toEqual(["node", "--test"]);
  });
});

describe("readPackageJson", () => {
  it("解析 scripts 并忽略损坏/缺失", () => {
    const dir = makeProject({ "package.json": JSON.stringify({ scripts: { test: "node --test" } }) });
    expect(readPackageJson(dir)).toEqual({ scripts: { test: "node --test" } });

    const broken = makeProject({ "package.json": "{" });
    expect(readPackageJson(broken)).toBeNull();

    const none = makeProject({ "index.html": "<h1>x</h1>" });
    expect(readPackageJson(none)).toBeNull();
  });
});

describe("P2-07 多结构探测与 python 计划", () => {
  it("无 package.json 的纯静态目录自动检测为 static", () => {
    const dir = makeProject({ "index.html": "<h1>hi</h1>", "README.md": "# r" });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("static");
    expect(plan.phases.map((p) => p.id)).toEqual(["verify"]);
  });

  it("requirements.txt 目录自动检测为 python，产出 install + test", () => {
    const dir = makeProject({
      "requirements.txt": "pytest\n",
      "tests/test_demo.py": "def test_x():\n    assert 1\n",
    });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("python");
    expect(plan.phases.map((p) => p.id)).toEqual(["install", "build", "test"]);
    expect(plan.phases[0].cmd[0]).toBe("sh");
    expect(plan.phases[0].cmd[2]).toContain("-r requirements.txt");
    expect(plan.phases[1].skipped).toBe(true);
    expect(plan.phases[2].cmd).toEqual(["python3", "-m", "pytest", "-q", "--disable-warnings"]);
  });

  it("pyproject.toml 目录自动检测为 python，install 使用 -e .", () => {
    const dir = makeProject({ "pyproject.toml": "[project]\n", "tests/__init__.py": "" });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("python");
    expect(plan.phases[0].cmd[2]).toContain("-e .");
    expect(plan.phases[2].cmd[0]).toBe("python3");
  });

  it("显式 runtime=python 覆盖结构检测（无 Python 清单）", () => {
    const dir = makeProject({ "main.py": "print(1)\n" });
    const plan = planPhases(dir, { runtime: "python" } satisfies ProjectSandboxConfig);
    expect(plan.runtime).toBe("python");
    expect(plan.phases[0].id).toBe("install");
  });

  it("python 配置可覆盖 install/test 命令，null 跳过对应阶段", () => {
    const dir = makeProject({ "src/app.py": "x = 1\n" });
    const plan = planPhases(dir, {
      runtime: "python",
      install: null,
      test: ["python3", "-m", "unittest", "discover"],
      build: null,
    } satisfies ProjectSandboxConfig);
    expect(plan.phases.map((p) => p.id)).toEqual(["test"]);
    expect(plan.phases[0].cmd).toEqual(["python3", "-m", "unittest", "discover"]);
  });

  it("python 项目无测试结构时 test 阶段 skipped", () => {
    const dir = makeProject({ "main.py": "print(1)\n" });
    const plan = planPhases(dir, { runtime: "python" } satisfies ProjectSandboxConfig);
    expect(plan.phases.find((p) => p.id === "test")?.skipped).toBe(true);
  });

  it("monorepo：根无清单但含 packages/app 子包 → 定位子包并按 node 计划", () => {
    const dir = makeProject({
      "packages/app/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "packages/app/package-lock.json": "{}",
      "README.md": "# monorepo",
    });
    const structure = detectProjectStructure(dir);
    expect(structure).toMatchObject({ runtime: "node", projectRoot: "packages/app", monorepoPackage: "packages/app" });
    const plan = planPhases(dir, {});
    expect(plan.runtime).toBe("node");
    expect(plan.phases.map((p) => p.id)).toEqual(["install", "build", "test"]);
    expect(plan.phases[0].cmd).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(plan.phases[2].cmd).toEqual(["npm", "test"]);
  });

  it("monorepo：多个候选子包按字母序取第一个，python 优先", () => {
    const dir = makeProject({
      "apps/web/package.json": "{}",
      "apps/api/package.json": "{}",
      "services/worker/pyproject.toml": "[project]\n",
    });
    const structure = detectProjectStructure(dir);
    expect(structure.runtime).toBe("python");
    expect(structure.projectRoot).toBe("services/worker");
  });

  it("static 增强：config.run 覆盖 verify 命令", () => {
    const dir = makeProject({ "index.html": "<p>ok</p>" });
    const plan = planPhases(dir, {
      runtime: "static",
      run: ["node", "-e", "console.log('custom run')"],
    } satisfies ProjectSandboxConfig);
    expect(plan.runtime).toBe("static");
    expect(plan.phases[0].cmd).toEqual(["node", "-e", "console.log('custom run')"]);
  });
});
