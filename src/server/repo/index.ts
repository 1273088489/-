// P2-02 Git 仓库接收与解析 —— 公共出口。
export { ingestRepository } from "./ingest";
export type { IngestSource, IngestDeps } from "./ingest";
export { analyzeRepo, cloneRepo } from "./git";
export type { CloneInput, GitOptions } from "./git";
export { extractArchive, inspectTree } from "./archive";
export type { TreeEntry, TreeInspection, ExtractArchiveInput } from "./archive";
export { buildUploadSnapshot } from "./upload";
export { REPO_LIMITS, validateRepoUrl, detectArchiveKind, isGitMetadataPath, isUnsafeArchivePath } from "./limits";
export { RepoError, REPO_ERROR_CODES, REPO_ERROR_MESSAGES, isRepoError } from "./errors";
export type { RepoErrorCode } from "./errors";
export type {
  RepoSnapshot,
  RepoSource,
  RepoSourceType,
  ArchiveKind,
  BranchInfo,
  CommitInfo,
  FileDiff,
  FileStatus,
  LineRange,
  RepoDiff,
  RepoTreeStats,
  RepoHead,
} from "./types";
