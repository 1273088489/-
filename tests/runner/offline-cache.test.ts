// RB-02 npm 离线缓存：解析/校验/参数生成 —— 纯函数单元测试（不依赖 docker）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NPM_OFFLINE_CACHE_CONTAINER_PATH,
  NPM_OFFLINE_CACHE_ENV,
  applyNpmOfflineToInstallPhase,
  npmOfflineEnv,
  npmOfflineFlags,
  offlineCacheUsable,
  resolveNpmOfflineCache,
} from "@/server/runner/offline-cache";
import type { SandboxPhase } from "@/server/runner/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-offline-cache-"));
}

const CACHE = { hostDir: "/tmp/quanzhan-cache", containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH };

/** 构造与 NodeJS.ProcessEnv 兼容的 env；删除缓存键，避免依赖真实 process.env。 */
function envOf(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env[NPM_OFFLINE_CACHE_ENV];
  // Next 全局声明 ProcessEnv.NODE_ENV 为必填。
  return { NODE_ENV: "test", ...env, ...overrides };
}

describe("resolveNpmOfflineCache", () => {
  it("env 未设置 → null", () => {
    expect(resolveNpmOfflineCache(envOf())).toBeNull();
    expect(resolveNpmOfflineCache(envOf({ OTHER_VAR: "x" }))).toBeNull();
  });

  it("env 为空字符串/空白 → null", () => {
    expect(resolveNpmOfflineCache(envOf({ [NPM_OFFLINE_CACHE_ENV]: "" }))).toBeNull();
    expect(resolveNpmOfflineCache(envOf({ [NPM_OFFLINE_CACHE_ENV]: "   " }))).toBeNull();
  });

  it("env 设置 → 返回 hostDir 与固定容器路径", () => {
    expect(resolveNpmOfflineCache(envOf({ [NPM_OFFLINE_CACHE_ENV]: "/tmp/cache" }))).toEqual({
      hostDir: "/tmp/cache",
      containerPath: "/workspace/.quanzhan-offline",
    });
  });

  it("常量为运维级 env 与固定容器路径", () => {
    expect(NPM_OFFLINE_CACHE_ENV).toBe("SANDBOX_NPM_OFFLINE_CACHE");
    expect(NPM_OFFLINE_CACHE_CONTAINER_PATH).toBe("/workspace/.quanzhan-offline");
  });
});

describe("offlineCacheUsable", () => {
  it("目录不存在 → false", () => {
    expect(offlineCacheUsable({ hostDir: "/no/such/cache/dir", containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH })).toBe(false);
  });

  it("hostDir 是文件 → false", () => {
    const file = path.join(tempDir(), "file");
    fs.writeFileSync(file, "x");
    expect(offlineCacheUsable({ hostDir: file, containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH })).toBe(false);
  });

  it("空目录 → false", () => {
    expect(offlineCacheUsable({ hostDir: tempDir(), containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH })).toBe(false);
  });

  it("非空目录 → true", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "cache-item"), "x");
    expect(offlineCacheUsable({ hostDir: dir, containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH })).toBe(true);
  });
});

describe("npmOfflineFlags / npmOfflineEnv", () => {
  it("flags 生成正确", () => {
    expect(npmOfflineFlags(CACHE)).toEqual(["--offline", "--cache", "/workspace/.quanzhan-offline"]);
  });

  it("env 生成正确", () => {
    expect(npmOfflineEnv(CACHE)).toEqual({
      npm_config_cache: "/workspace/.quanzhan-offline",
      npm_config_offline: "true",
      npm_config_prefer_offline: "true",
    });
  });
});

describe("applyNpmOfflineToInstallPhase", () => {
  it("npm ci 追加 flags，且不改原阶段对象", () => {
    const phase: SandboxPhase = { id: "install", label: "安装依赖", cmd: ["npm", "ci", "--no-audit", "--no-fund"] };
    const applied = applyNpmOfflineToInstallPhase(phase, CACHE);
    expect(applied.cmd).toEqual(["npm", "ci", "--no-audit", "--no-fund", "--offline", "--cache", "/workspace/.quanzhan-offline"]);
    expect(phase.cmd).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(applied).not.toBe(phase);
  });

  it("npm install 追加 flags", () => {
    const applied = applyNpmOfflineToInstallPhase({ id: "install", label: "安装依赖", cmd: ["npm", "install"] }, CACHE);
    expect(applied.cmd).toEqual(["npm", "install", "--offline", "--cache", "/workspace/.quanzhan-offline"]);
  });

  it("已含 --offline 时去重，不重复追加", () => {
    const phase: SandboxPhase = { id: "install", label: "安装依赖", cmd: ["npm", "ci", "--offline", "--no-audit"] };
    const applied = applyNpmOfflineToInstallPhase(phase, CACHE);
    expect(applied.cmd).toEqual(["npm", "ci", "--offline", "--no-audit"]);
    expect(applied).toBe(phase);
  });

  it("非 npm 命令（yarn）不改", () => {
    const phase: SandboxPhase = { id: "install", label: "安装依赖", cmd: ["yarn", "install"] };
    expect(applyNpmOfflineToInstallPhase(phase, CACHE)).toBe(phase);
  });

  it("非 install 阶段不改", () => {
    const phase: SandboxPhase = { id: "build", label: "构建", cmd: ["npm", "run", "build"] };
    expect(applyNpmOfflineToInstallPhase(phase, CACHE)).toBe(phase);
  });

  it("skipped 的 install 阶段不改", () => {
    const phase: SandboxPhase = { id: "install", label: "安装依赖", cmd: [], skipped: true };
    expect(applyNpmOfflineToInstallPhase(phase, CACHE)).toBe(phase);
  });
});
