// P2-04 测试工作区准备：在宿主临时目录复制学习者项目，并把测试文件注入到
// 一个随机命名的点目录中。公开/隐藏测试各自使用独立工作区：
// - 公开工作区中绝不出现隐藏测试文件；
// - 隐藏工作区中隐藏文件只以随机目录名共存，且隐藏运行只执行固定测试命令
//   （不执行学习者脚本），配合沙箱 --network=none / 只读，防止读取与外泄。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { TestCasePlan } from "./types";

export const INJECTED_DIR_PREFIX = ".quanzhan-tests-";

/** 注入目录名（随机后缀，避免学习者代码盲猜路径）。 */
export function injectedDirName(): string {
  return `${INJECTED_DIR_PREFIX}${randomBytes(5).toString("hex")}`;
}

/** 校验测试文件相对路径：仅允许扁平相对路径，拒绝绝对路径、.. 与符号链接逃逸。 */
export function assertSafeRelativePath(filePath: string): string {
  if (!filePath || typeof filePath !== "string") throw new Error("测试文件路径无效");
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`测试文件路径非法：${filePath}`);
  }
  if (/[\0]/.test(normalized)) throw new Error(`测试文件路径非法：${filePath}`);
  return normalized;
}

/** 复制项目目录到新临时目录（排除 .git / node_modules，避免复制大目录）。 */
export function copyProjectForTests(sourceDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(INJECTED_DIR_PREFIX)) continue;
    const from = path.join(sourceDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(from, to, { recursive: true, dereference: false });
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

export interface TestWorkspace {
  /** 复制后的项目根目录（含注入文件），作为沙箱 projectDir。 */
  workspaceDir: string;
  /** 容器工作目录内的注入目录名（相对 /workspace）。 */
  injectedDir: string;
  cleanup: () => void;
}

/**
 * 准备单个测试用例的工作区：
 * - 复制学习者项目（排除 .git / node_modules）；
 * - 把 files 写入 <workspace>/<injectedDir>/<path>；
 * - 若项目没有 package.json，注入最小 package.json 标记，使 P2-03 runner
 *   的 node 计划（install/build 为 null，仅 test 阶段）能执行测试命令。
 */
export function prepareTestWorkspace(projectDir: string, plan: TestCasePlan): TestWorkspace {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-test-ws-"));
  try {
    copyProjectForTests(projectDir, workspaceDir);
    const injectedDir = injectedDirName();
    const injectedRoot = path.join(workspaceDir, injectedDir);
    fs.mkdirSync(injectedRoot, { recursive: true });
    for (const [relativePath, content] of Object.entries(plan.files)) {
      const safePath = assertSafeRelativePath(relativePath);
      const target = path.join(injectedRoot, safePath);
      if (!target.startsWith(injectedRoot + path.sep)) {
        throw new Error(`测试文件路径越界：${relativePath}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    }
    if (!fs.existsSync(path.join(workspaceDir, "package.json"))) {
      fs.writeFileSync(
        path.join(workspaceDir, "package.json"),
        JSON.stringify({ name: "quanzhan-tests", private: true, scripts: {} }, null, 2),
        "utf8",
      );
    }
    return {
      workspaceDir,
      injectedDir,
      cleanup: () => fs.rmSync(workspaceDir, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    throw error;
  }
}
