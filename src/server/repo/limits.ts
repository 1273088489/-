// P2-02 仓库接收限制与 URL 校验。
// 限制同时作用于上传压缩包与 git clone 产物，防止资源耗尽。
import type { ArchiveKind } from "./types";

export const REPO_LIMITS = {
  /** 上传压缩包原始字节上限（50MB）。 */
  maxArchiveBytes: 50 * 1024 * 1024,
  /** 解压/检出后仓库总字节上限（规格：仓库 ≤ 50MB）。 */
  maxExtractedBytes: 50 * 1024 * 1024,
  /** 文件数上限（规格：≤ 2000）。 */
  maxFileCount: 2000,
  /** 单文件字节上限（规格：≤ 1MB）。 */
  maxSingleFileBytes: 1024 * 1024,
  /** git clone 深度（浅克隆，防历史拉爆）。 */
  maxCloneDepth: 1,
  /** git clone 超时（毫秒）。 */
  maxCloneTimeoutMs: 60_000,
  /** 最近提交分析数量。 */
  maxRecentCommits: 20,
  /** 分支列表上限。 */
  maxBranches: 200,
  /** 一般命令输出上限（字节）。 */
  maxCommandOutputBytes: 2 * 1024 * 1024,
  /** diff 输出上限（字节）；大仓库全量 diff 可能超过一般上限。 */
  maxDiffOutputBytes: 64 * 1024 * 1024,
} as const;

const HTTPS_PREFIX = /^https:\/\//i;
// 禁止指向本机/回环/内网（SSRF 面收窄）：localhost、127.x、10.x、192.168.x、172.16-31.x。
const PRIVATE_HOST_PATTERN = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export type UrlValidationResult = { ok: true; url: string } | { ok: false; reason: string };

/** 仅接受 https:// 且无账号密码、不指向本机/内网的公开仓库地址。 */
export function validateRepoUrl(raw: string): UrlValidationResult {
  const url = raw.trim();
  if (!url) return { ok: false, reason: "仓库地址不能为空" };
  if (url.length > 2000) return { ok: false, reason: "仓库地址过长" };
  if (!HTTPS_PREFIX.test(url)) return { ok: false, reason: "仅支持 https:// 仓库地址" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "仓库地址格式无效" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "仅支持 https:// 仓库地址" };
  if (parsed.username || parsed.password) return { ok: false, reason: "仓库地址不能包含账号密码" };
  if (!parsed.hostname) return { ok: false, reason: "仓库地址缺少主机名" };
  if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) return { ok: false, reason: "不允许访问本机或内网仓库地址" };
  return { ok: true, url };
}

/** 根据文件名识别支持的压缩包类型。 */
export function detectArchiveKind(fileName: string): ArchiveKind | null {
  const name = fileName.trim().toLowerCase();
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "tar.gz";
  return null;
}

/** 是否为 git 元数据路径（上传包与文件树分析时忽略，避免泄露 .git 历史）。 */
export function isGitMetadataPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.split("/").includes(".git");
}

/** 压缩包条目路径是否安全（拒绝绝对路径、盘符、.. 段、./ 前缀、NUL 与超长段）。 */
export function isUnsafeArchivePath(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized.length === 0) return true;
  if (normalized.startsWith("/")) return true;
  if (/^[A-Za-z]:/.test(normalized)) return true;
  if (normalized.startsWith("./") || /\0/.test(normalized)) return true;
  const segments = normalized.split("/");
  return segments.some((segment) => segment === ".." || segment.length > 255);
}
