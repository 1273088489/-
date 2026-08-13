// P2-03/P2-07 运行时适配器：项目结构探测 + 按运行时/配置展开阶段命令计划。
// 主进程只读取仓库文件（package.json / requirements / pyproject / pytest.ini）判断结构，
// 绝不执行仓库代码；执行统一经 src/server/sandbox 的受限容器。
import fs from "node:fs";
import path from "node:path";
import type { ProjectSandboxConfig, SandboxPhase, SandboxPhaseId, SandboxRuntime } from "./types";
import { defaultRuntimeForProject } from "./config";

export interface AdapterPlan {
  runtime: SandboxRuntime;
  phases: SandboxPhase[];
}

export const PYTHON_MANIFESTS = ["requirements.txt", "requirements-dev.txt", "pyproject.toml", "setup.py", "setup.cfg", "pytest.ini", "tox.ini"] as const;
export const PYTHON_TEST_FILES = ["pytest.ini", "tox.ini", "tests", "test"] as const;

export function hasPackageJsonFile(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, "package.json"));
}

/** 目录内是否存在可视为“项目根”的 Node/Python 清单（排除 node_modules / .git）。 */
export function hasProjectManifest(projectDir: string): boolean {
  return (
    hasPackageJsonFile(projectDir) ||
    PYTHON_MANIFESTS.some((name) => fs.existsSync(path.join(projectDir, name)) || fs.existsSync(path.join(projectDir, name.toLowerCase())))
  );
}

export function hasPythonManifest(projectDir: string): boolean {
  return PYTHON_MANIFESTS.some((name) => fs.existsSync(path.join(projectDir, name)) || fs.existsSync(path.join(projectDir, name.toLowerCase())));
}

export function hasPythonTestStructure(projectDir: string): boolean {
  if (PYTHON_TEST_FILES.some((name) => fs.existsSync(path.join(projectDir, name)) || fs.existsSync(path.join(projectDir, name.toLowerCase())))) return true;
  try {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isDirectory() && /^(tests?|test_)/i.test(entry.name)) return true;
    }
  } catch {
    /* 目录不可读时按无测试结构处理 */
  }
  return false;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

/** 宿主只读解析 package.json（不执行任何脚本）；损坏/缺失返回 null。 */
export function readPackageJson(projectDir: string): PackageJson | null {
  const filePath = path.join(projectDir, "package.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const pkg = parsed as Record<string, unknown>;
    const scripts = pkg.scripts;
    return {
      scripts: typeof scripts === "object" && scripts !== null
        ? Object.fromEntries(Object.entries(scripts as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]))
        : undefined,
    };
  } catch {
    return null;
  }
}

function scriptPhase(id: SandboxPhaseId, label: string, scriptName: string, pkg: PackageJson | null): SandboxPhase {
  if (pkg?.scripts && typeof pkg.scripts[scriptName] === "string" && pkg.scripts[scriptName].trim().length > 0) {
    // test 阶段使用约定命令 npm test；其余脚本（如 build）用 npm run <name>。
    return { id, label, cmd: scriptName === "test" ? ["npm", "test"] : ["npm", "run", scriptName] };
  }
  return { id, label, cmd: [], skipped: true };
}

function planNodePhases(projectDir: string, config: ProjectSandboxConfig): SandboxPhase[] {
  const pkg = readPackageJson(projectDir);
  const phases: SandboxPhase[] = [];

  if (config.install !== null) {
    if (config.install && config.install.length > 0) {
      phases.push({ id: "install", label: "安装依赖", cmd: config.install });
    } else {
      const hasLockfile =
        fs.existsSync(path.join(projectDir, "package-lock.json")) ||
        fs.existsSync(path.join(projectDir, "npm-shrinkwrap.json"));
      phases.push({
        id: "install",
        label: "安装依赖",
        cmd: hasLockfile
          ? ["npm", "ci", "--no-audit", "--no-fund"]
          : ["npm", "install", "--no-audit", "--no-fund"],
      });
    }
  }

  if (config.build !== null) {
    if (config.build && config.build.length > 0) {
      phases.push({ id: "build", label: "构建", cmd: config.build });
    } else {
      phases.push(scriptPhase("build", "构建", "build", pkg));
    }
  }

  if (config.test !== null) {
    if (config.test && config.test.length > 0) {
      phases.push({ id: "test", label: "测试", cmd: config.test });
    } else {
      phases.push(scriptPhase("test", "测试", "test", pkg));
    }
  }

  return phases;
}

/** 静态校验命令：列出非点文件数量并退出（不执行仓库代码）。 */
export const STATIC_VERIFY_CMD = [
  "node",
  "-e",
  'const fs=require("node:fs"); const files=fs.readdirSync(".").filter((f)=>!f.startsWith(".")).sort(); console.log("STATIC_VERIFY files="+files.length); process.exit(files.length>0?0:1)',
] as const;

function planStaticPhases(config: ProjectSandboxConfig): SandboxPhase[] {
  const verifyCmd = config.run && config.run.length > 0 ? config.run : [...STATIC_VERIFY_CMD];
  return [{ id: "verify", label: "静态文件校验", cmd: verifyCmd }];
}

/**
 * Python 阶段计划（P2-07）：
 * - install：优先 venv + pip（requirements.txt 时 `pip install -r`，否则 pip install -e .）；
 *   镜像没有 python3-venv 时回退 pip --user（沙箱 HOME=/tmp 可写）。
 *   配置显式 install 命令时原样执行。
 * - test：缺省 `pytest -q --disable-warnings`；项目无测试结构时标记 skipped。
 * - build：Python 项目一般不单独构建，缺省跳过。
 */
export function planPythonPhases(projectDir: string, config: ProjectSandboxConfig): SandboxPhase[] {
  const phases: SandboxPhase[] = [];
  const hasRequirements = fs.existsSync(path.join(projectDir, "requirements.txt")) || fs.existsSync(path.join(projectDir, "requirements-dev.txt"));

  if (config.install !== null) {
    if (config.install && config.install.length > 0) {
      phases.push({ id: "install", label: "安装依赖", cmd: config.install });
    } else {
      phases.push({
        id: "install",
        label: "安装依赖（venv + pip）",
        cmd: ["sh", "-c", "python3 -m venv .venv 2>/dev/null || true; if [ -x .venv/bin/python ] || [ -x .venv/bin/python3 ]; then PY=.venv/bin/python; else PY=python3; fi; if $PY -m pip --version >/dev/null 2>&1; then :; else $PY -m ensurepip --upgrade >/dev/null 2>&1 || true; fi; $PY -m pip install --no-input --disable-pip-version-check --quiet " + (hasRequirements ? "-r requirements.txt" : "-e .")],
      });
    }
  }

  if (config.build !== null) {
    if (config.build && config.build.length > 0) {
      phases.push({ id: "build", label: "构建", cmd: config.build });
    } else {
      phases.push({ id: "build", label: "构建", cmd: [], skipped: true });
    }
  }

  if (config.test !== null) {
    if (config.test && config.test.length > 0) {
      phases.push({ id: "test", label: "测试", cmd: config.test });
    } else if (hasPythonTestStructure(projectDir)) {
      phases.push({ id: "test", label: "测试（pytest）", cmd: ["python3", "-m", "pytest", "-q", "--disable-warnings"] });
    } else {
      phases.push({ id: "test", label: "测试（pytest）", cmd: [], skipped: true });
    }
  }

  return phases;
}

export interface ProjectStructure {
  runtime: SandboxRuntime;
  /** 探测到的工作目录（相对 projectDir）；默认 "" 表示根目录为项目根。 */
  projectRoot: string;
  /** monorepo 下命中的子包路径（package.json 所在相对目录）。 */
  monorepoPackage?: string;
}

/**
 * 多项目结构探测（P2-07）：
 * - 根目录有 package.json → node，projectRoot="";
 * - 根目录无清单但存在子目录（depth≤2，跳过 node_modules/隐藏目录）含 package.json
 *   / Python 清单 → 视为 monorepo，取相对路径最短、字典序最小的命中包；python 优先。
 * - 根目录有 Python 清单 → python。
 * - 其余纯 HTML/CSS/JS/README → static。
 */
export function detectProjectStructure(projectDir: string): ProjectStructure {
  if (hasPackageJsonFile(projectDir)) return { runtime: "node", projectRoot: "" };
  if (hasPythonManifest(projectDir)) return { runtime: "python", projectRoot: "" };

  const candidates: Array<{ dir: string; runtime: SandboxRuntime }> = [];
  const scanDir = (dir: string, depth: number): void => {
    if (depth > 2) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (hasPackageJsonFile(full)) candidates.push({ dir: path.relative(projectDir, full), runtime: "node" });
      else if (hasPythonManifest(full)) candidates.push({ dir: path.relative(projectDir, full), runtime: "python" });
      scanDir(full, depth + 1);
    }
  };
  scanDir(projectDir, 0);

  candidates.sort((left, right) => {
    const leftParts = left.dir.split("/").length;
    const rightParts = right.dir.split("/").length;
    if (leftParts !== rightParts) return leftParts - rightParts;
    return left.dir.localeCompare(right.dir);
  });
  const pythonFirst = candidates.find((candidate) => candidate.runtime === "python");
  const chosen = pythonFirst ?? candidates[0];
  if (!chosen) return { runtime: "static", projectRoot: "" };
  return { runtime: chosen.runtime, projectRoot: chosen.dir, monorepoPackage: chosen.dir };
}

/**
 * 生成阶段执行计划：
 * - config.runtime 显式声明时按声明执行；
 * - 未声明时按仓库结构自动检测（node / python / static，monorepo 取子包）；
 * - 配置声明 node 但仓库没有 package.json 时按 static 兜底，避免无意义地执行 npm；
 * - 配置声明 python 时保留 python 计划（镜像必需含 python3 与 pip）。
 */
export function planPhases(projectDir: string, config: ProjectSandboxConfig): AdapterPlan {
  const { runtime: detectedRuntime, projectRoot } = detectProjectStructure(projectDir);
  const runtime: SandboxRuntime = config.runtime ?? detectedRuntime;
  const structureDir = runtime === detectedRuntime && projectRoot ? path.join(projectDir, projectRoot) : undefined;
  const workDir = structureDir ?? projectDir;
  if (runtime === "static") return { runtime: "static", phases: planStaticPhases(config) };
  if (runtime === "python") return { runtime: "python", phases: planPythonPhases(workDir, config) };
  if (!hasPackageJsonFile(workDir)) return { runtime: "static", phases: planStaticPhases(config) };
  return { runtime: "node", phases: planNodePhases(workDir, config) };
}
