// P2-02 Git 仓库接收与解析 —— 结构化快照类型。
// RepoSnapshot 是仓库接收/解析的产物：只保留结构化元数据（不保留临时路径），
// 供评分、展示与后续沙箱执行（P2-03）复用。

export type RepoSourceType = "url" | "archive";
export type ArchiveKind = "zip" | "tar.gz";

export interface RepoSource {
  type: RepoSourceType;
  url?: string;
  archiveName?: string;
  archiveKind?: ArchiveKind;
}

export interface BranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  subject: string;
}

/** 变更文件的连续行区间（git diff hunk 解析结果；endLine 含端点）。 */
export interface LineRange {
  startLine: number;
  /** 包含端点；纯删除 hunk 无新增行时为 0。 */
  endLine: number;
  additions: number;
  deletions: number;
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileDiff {
  path: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
  lineRanges: LineRange[];
}

export interface RepoDiff {
  /** 对比基线：父提交 hash / 空树 hash / "upload"（上传包无 Git 历史）。 */
  baseRef: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: FileDiff[];
}

export interface RepoTreeStats {
  fileCount: number;
  totalBytes: number;
  largestFileBytes: number;
  /** 相对仓库根目录的文件路径（不含 .git）。 */
  files: string[];
}

export interface RepoHead {
  branch: string;
  commitHash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
}

export interface RepoSnapshot {
  source: RepoSource;
  /** 上传包无 Git 元数据时为 null。 */
  head: RepoHead | null;
  branches: BranchInfo[];
  commits: CommitInfo[];
  diff: RepoDiff;
  tree: RepoTreeStats;
  analyzedAt: string;
}
