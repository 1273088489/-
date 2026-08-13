// P2-02 仓库接收/解析错误分类。
// 错误码是稳定的机器可读标识，路由层会透传给客户端；消息面向学习者。
export const REPO_ERROR_CODES = [
  "invalid-url",
  "invalid-archive",
  "archive-too-large",
  "too-many-files",
  "file-too-large",
  "unsafe-path",
  "clone-failed",
  "not-a-git-repo",
  "analysis-failed",
  "io-error",
] as const;

export type RepoErrorCode = (typeof REPO_ERROR_CODES)[number];

export const REPO_ERROR_MESSAGES: Record<RepoErrorCode, string> = {
  "invalid-url": "仓库地址无效：仅支持 https://，且不能包含账号密码或指向本机/内网。",
  "invalid-archive": "压缩包格式不支持或已损坏：仅支持 .zip / .tar.gz。",
  "archive-too-large": "压缩包或解压后的仓库超过大小限制（50MB）。",
  "too-many-files": "仓库文件数超过限制（2000 个）。",
  "file-too-large": "仓库存在超过限制（1MB）的单个文件。",
  "unsafe-path": "压缩包包含不安全路径（路径穿越或符号链接）。",
  "clone-failed": "Git 仓库克隆失败，请确认地址可公开访问且协议为 https。",
  "not-a-git-repo": "目标目录不是有效的 Git 仓库。",
  "analysis-failed": "仓库分析失败，请稍后重试。",
  "io-error": "文件读写失败，请稍后重试。",
};

/** 仓库接收/解析失败（带稳定错误码，供客户端分类展示）。 */
export class RepoError extends Error {
  readonly code: RepoErrorCode;
  readonly detail?: string;

  constructor(code: RepoErrorCode, message?: string, detail?: string) {
    super(message ?? REPO_ERROR_MESSAGES[code]);
    this.name = "RepoError";
    this.code = code;
    this.detail = detail;
  }
}


/** 跨模块实例/序列化场景下的健壮判断（不依赖 instanceof 的单一注册表）。 */
export function isRepoError(error: unknown): error is RepoError {
  return (
    error instanceof RepoError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      REPO_ERROR_CODES.includes((error as { code: string }).code as RepoErrorCode))
  );
}

export function repoErrorMessage(code: RepoErrorCode): string {
  return REPO_ERROR_MESSAGES[code];
}
