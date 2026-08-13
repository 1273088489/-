// P2-02 Git 克隆与仓库分析。
// 克隆使用 `git clone --depth 1 --no-single-branch`：浅克隆限制历史深度，
// 同时保留所有远程分支的 tip 用于分支分析。所有参数以数组传 spawn，不经 shell。
import fs from "node:fs";
import path from "node:path";
import { RepoError } from "./errors";
import { runCommand } from "./exec";
import { REPO_LIMITS } from "./limits";
import { inspectTree } from "./archive";
import type { BranchInfo, CommitInfo, FileDiff, FileStatus, LineRange, RepoSnapshot, RepoSource } from "./types";

const GIT_DEFAULT_TIMEOUT_MS = 15_000;
const RECORD_SEPARATOR = "\x1f";

export interface GitOptions {
  gitBinary?: string;
  timeoutMs?: number;
}

export interface CloneInput {
  url: string;
  destDir: string;
  depth?: number;
  timeoutMs?: number;
  gitBinary?: string;
}

async function runGit(args: string[], cwd: string, options: GitOptions & { maxOutputBytes?: number } = {}): Promise<{ stdout: string; truncated: boolean }> {
  const result = await runCommand(options.gitBinary ?? "git", args, {
    timeoutMs: options.timeoutMs ?? GIT_DEFAULT_TIMEOUT_MS,
    maxOutputBytes: options.maxOutputBytes ?? REPO_LIMITS.maxCommandOutputBytes,
    cwd,
  });
  if (result.code !== 0) {
    throw new RepoError("analysis-failed", undefined, `git ${args[0]} 失败：${result.stderr.trim()}`);
  }
  return { stdout: result.stdout, truncated: result.truncated };
}

/** 浅克隆公开仓库到 destDir（调用方负责清理）。 */
export async function cloneRepo(input: CloneInput): Promise<void> {
  const depth = input.depth ?? REPO_LIMITS.maxCloneDepth;
  const result = await runCommand(input.gitBinary ?? "git", [
    "clone",
    "--depth",
    String(depth),
    "--no-single-branch",
    "--",
    input.url,
    input.destDir,
  ], {
    timeoutMs: input.timeoutMs ?? REPO_LIMITS.maxCloneTimeoutMs,
    maxOutputBytes: REPO_LIMITS.maxCommandOutputBytes,
  });
  if (result.code !== 0) {
    const detail = result.timedOut ? `克隆超时（${REPO_LIMITS.maxCloneTimeoutMs}ms）` : result.stderr.trim() || "克隆失败";
    throw new RepoError("clone-failed", undefined, detail);
  }
}

async function gitOutput(args: string[], dir: string, options: GitOptions = {}): Promise<string> {
  return (await runGit(args, dir, options)).stdout;
}

/** 当前 HEAD 分支名（detached HEAD 时返回 "HEAD"）。 */
async function headBranch(dir: string, options: GitOptions): Promise<string> {
  try {
    const out = await gitOutput(["symbolic-ref", "--short", "HEAD"], dir, options);
    const branch = out.trim();
    return branch || "HEAD";
  } catch {
    const out = await gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], dir, options);
    return out.trim() || "HEAD";
  }
}

function parseBranches(stdout: string, head: string): BranchInfo[] {
  const names = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "remotes/origin/HEAD");
  const unique = [...new Set(names)];
  return unique.slice(0, REPO_LIMITS.maxBranches).map((name) => ({
    name,
    isHead: name === head || name === `origin/${head}` || name === `remotes/origin/${head}`,
    isRemote: name.startsWith("remotes/") || name.startsWith("origin/"),
  }));
}

function parseCommits(stdout: string): CommitInfo[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, authorName, authorEmail, committedAt, ...subjectParts] = line.split(RECORD_SEPARATOR);
      return {
        hash,
        shortHash,
        authorName,
        authorEmail,
        committedAt,
        subject: subjectParts.join(RECORD_SEPARATOR),
      };
    });
}

function parseStatusLetter(letter: string): FileStatus {
  if (letter.startsWith("A")) return "added";
  if (letter.startsWith("D")) return "deleted";
  if (letter.startsWith("R")) return "renamed";
  return "modified";
}

/** `git diff --name-status -z`：status 与路径成对出现（R/C 为 status, old, new）。 */
function parseNameStatus(stdout: string): Map<string, FileStatus> {
  const parts = stdout.split("\0").filter((part) => part.length > 0);
  const statuses = new Map<string, FileStatus>();
  for (let i = 0; i < parts.length; i += 1) {
    const status = parts[i];
    if (/^[AMDRC]/.test(status)) {
      if (status.startsWith("R") || status.startsWith("C")) {
        if (i + 2 < parts.length) {
          statuses.set(parts[i + 2], parseStatusLetter(status));
          i += 2;
        }
      } else if (i + 1 < parts.length) {
        statuses.set(parts[i + 1], parseStatusLetter(status));
        i += 1;
      }
    }
  }
  return statuses;
}

/** `git diff --numstat`：added\tdeleted\tpath（二进制为 -）。 */
function parseNumstat(stdout: string): Map<string, { insertions: number; deletions: number }> {
  const counts = new Map<string, { insertions: number; deletions: number }>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, ...pathParts] = line.split("\t");
    if (!pathParts.length) continue;
    const filePath = pathParts.join("\t");
    counts.set(filePath, {
      insertions: addedRaw === "-" ? 0 : Number.parseInt(addedRaw, 10) || 0,
      deletions: deletedRaw === "-" ? 0 : Number.parseInt(deletedRaw, 10) || 0,
    });
  }
  return counts;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** `git diff --unified=0`：解析每个文件的 hunk 行区间。 */
function parseDiffHunks(stdout: string): Map<string, LineRange[]> {
  const rangesByFile = new Map<string, LineRange[]>();
  let currentPath: string | null = null;
  let newFile = false;
  let deletedFile = false;
  let renamed = false;

  const rangesFor = (pathValue: string): LineRange[] => {
    let ranges = rangesByFile.get(pathValue);
    if (!ranges) {
      ranges = [];
      rangesByFile.set(pathValue, ranges);
    }
    return ranges;
  };

  for (const rawLine of stdout.split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      currentPath = null;
      newFile = false;
      deletedFile = false;
      renamed = false;
      continue;
    }
    if (rawLine.startsWith("new file mode")) newFile = true;
    if (rawLine.startsWith("deleted file mode")) deletedFile = true;
    if (rawLine.startsWith("similarity index")) renamed = true;
    if (rawLine.startsWith("+++ b/")) {
      const filePath = rawLine.slice(6).replace(/^b\//, "");
      currentPath = filePath;
      if (newFile || deletedFile || renamed) rangesFor(currentPath);
      continue;
    }
    const hunk = HUNK_HEADER.exec(rawLine);
    if (hunk && currentPath) {
      const oldCount = hunk[2] ? Number.parseInt(hunk[2], 10) : 1;
      const newStart = Number.parseInt(hunk[3], 10);
      const newCount = hunk[4] ? Number.parseInt(hunk[4], 10) : 1;
      const ranges = rangesFor(currentPath);
      if (newCount > 0) {
        ranges.push({
          startLine: newStart,
          endLine: newStart + newCount - 1,
          additions: newCount,
          deletions: oldCount,
        });
      }
    }
  }
  return rangesByFile;
}

async function resolveDiffBase(dir: string, options: GitOptions): Promise<string> {
  try {
    const parent = (await gitOutput(["rev-parse", "--verify", "HEAD^"], dir, options)).trim();
    if (parent) return parent;
  } catch {
    // 根提交或浅克隆无父提交：以空树为基线（整个仓库视为新增）。
  }
  const emptyTree = (await gitOutput(["hash-object", "-t", "tree", "/dev/null"], dir, options)).trim();
  return emptyTree || "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
}

/** 分析已克隆到 dir 的 Git 仓库，产出结构化 RepoSnapshot。 */
export async function analyzeRepo(dir: string, source: RepoSource, options: GitOptions = {}): Promise<RepoSnapshot> {
  if (!fs.existsSync(path.join(dir, ".git"))) throw new RepoError("not-a-git-repo");

  const head = await headBranch(dir, options);
  const baseRef = await resolveDiffBase(dir, options);

  const [branchOut, commitOut, statusOut, numstatOut, diffRun] = await Promise.all([
    gitOutput(["branch", "-a", "--no-color", "--format=%(refname:short)"], dir, options),
    gitOutput(["log", `-n ${REPO_LIMITS.maxRecentCommits}`, `--pretty=format:%H${RECORD_SEPARATOR}%h${RECORD_SEPARATOR}%an${RECORD_SEPARATOR}%ae${RECORD_SEPARATOR}%aI${RECORD_SEPARATOR}%s`], dir, options),
    gitOutput(["diff", "--name-status", "-z", baseRef, "HEAD"], dir, options),
    gitOutput(["diff", "--numstat", baseRef, "HEAD"], dir, options),
    runGit(["diff", "--unified=0", baseRef, "HEAD"], dir, { ...options, maxOutputBytes: REPO_LIMITS.maxDiffOutputBytes }),
  ]);
  if (diffRun.truncated) throw new RepoError("analysis-failed", undefined, "diff 输出超过分析上限");

  const branches = parseBranches(branchOut, head);
  const commits = parseCommits(commitOut);
  const statuses = parseNameStatus(statusOut);
  const counts = parseNumstat(numstatOut);
  const hunkRanges = parseDiffHunks(diffRun.stdout);

  const changedPaths = new Set([...statuses.keys(), ...counts.keys(), ...hunkRanges.keys()]);
  const files: FileDiff[] = [...changedPaths].sort((left, right) => left.localeCompare(right)).map((filePath) => {
    const count = counts.get(filePath) ?? { insertions: 0, deletions: 0 };
    const ranges = hunkRanges.get(filePath);
    const fallbackRange: LineRange[] = [];
    return {
      path: filePath,
      status: statuses.get(filePath) ?? (count.deletions > 0 ? "modified" : "added"),
      insertions: count.insertions,
      deletions: count.deletions,
      lineRanges: ranges ?? fallbackRange,
    };
  });

  const tree = inspectTree(dir, { rejectSymlinks: false });
  const firstCommit = commits[0];

  return {
    source,
    head: firstCommit
      ? {
          branch: head,
          commitHash: firstCommit.hash,
          shortHash: firstCommit.shortHash,
          subject: firstCommit.subject,
          authorName: firstCommit.authorName,
          authorEmail: firstCommit.authorEmail,
          committedAt: firstCommit.committedAt,
        }
      : null,
    branches,
    commits,
    diff: {
      baseRef,
      filesChanged: files.length,
      insertions: files.reduce((total, file) => total + file.insertions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
      files,
    },
    tree: {
      fileCount: tree.fileCount,
      totalBytes: tree.totalBytes,
      largestFileBytes: tree.largestFileBytes,
      files: tree.entries.map((entry) => entry.path),
    },
    analyzedAt: new Date().toISOString(),
  };
}
