// RB-02 npm 离线依赖缓存：解析/校验/参数生成。
// 缓存目录是运维级环境变量（SANDBOX_NPM_OFFLINE_CACHE），不是课程数据；
// 管理员在带网络主机上预取 npm cache，沙箱内用 --offline 命中该缓存，
// 不放开沙箱网络（--network=none 保持不变）。
import fs from "node:fs";
import type { SandboxPhase } from "./types";

/** 宿主 npm 离线缓存目录（运维级 env）。 */
export const NPM_OFFLINE_CACHE_ENV = "SANDBOX_NPM_OFFLINE_CACHE";

/** 容器内缓存路径：单层、位于可写 workdir（/workspace）之下。 */
export const NPM_OFFLINE_CACHE_CONTAINER_PATH = "/workspace/.quanzhan-offline";

export interface NpmOfflineCache {
  hostDir: string;
  containerPath: string;
}

/** 从环境变量解析离线缓存配置；未设置或为空字符串 → null。 */
export function resolveNpmOfflineCache(env: NodeJS.ProcessEnv = process.env): NpmOfflineCache | null {
  const hostDir = env[NPM_OFFLINE_CACHE_ENV];
  if (!hostDir || hostDir.trim() === "") return null;
  return { hostDir, containerPath: NPM_OFFLINE_CACHE_CONTAINER_PATH };
}

/** 缓存可用：宿主目录存在、是目录且 readdir 至少一个条目。 */
export function offlineCacheUsable(cfg: NpmOfflineCache): boolean {
  try {
    const stat = fs.statSync(cfg.hostDir);
    if (!stat.isDirectory()) return false;
    return fs.readdirSync(cfg.hostDir).length > 0;
  } catch {
    return false;
  }
}

/** 追加到 install 命令尾部的 npm flags。 */
export function npmOfflineFlags(cfg: NpmOfflineCache): string[] {
  return ["--offline", "--cache", cfg.containerPath];
}

/** 合并进容器 env 的 npm 离线配置（本模块强制项，须覆盖 config.env 同名键）。 */
export function npmOfflineEnv(cfg: NpmOfflineCache): Record<string, string> {
  return {
    npm_config_cache: cfg.containerPath,
    npm_config_offline: "true",
    npm_config_prefer_offline: "true",
  };
}

/**
 * 只对 install 阶段且以 npm 开头的命令追加离线 flags（去重：已含 --offline 时不重复追加）；
 * 其余情况（非 install / skipped / 非 npm）原样返回。
 */
export function applyNpmOfflineToInstallPhase(phase: SandboxPhase, cfg: NpmOfflineCache): SandboxPhase {
  if (phase.id !== "install" || phase.skipped === true || phase.cmd[0] !== "npm") return phase;
  if (phase.cmd.includes("--offline")) return phase;
  return { ...phase, cmd: [...phase.cmd, ...npmOfflineFlags(cfg)] };
}
