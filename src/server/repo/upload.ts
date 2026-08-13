// P2-02 上传包（无 Git 历史）分析：以文件树产出 RepoSnapshot。
// 所有文件视为"added"，行区间覆盖整个文本文件，作为后续评分的行号证据。
import fs from "node:fs";
import path from "node:path";
import { inspectTree } from "./archive";
import type { FileDiff, LineRange, RepoSnapshot, RepoSource } from "./types";

function isBinary(content: Buffer): boolean {
  const sample = content.subarray(0, 8000);
  return sample.includes(0);
}

function countLines(content: Buffer): number {
  if (content.length === 0) return 0;
  const text = content.toString("utf8");
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/** 将解包后的文件树转成 RepoSnapshot（head/branches/commits 为空）。 */
export async function buildUploadSnapshot(dir: string, source: RepoSource): Promise<RepoSnapshot> {
  const inspection = inspectTree(dir, { rejectSymlinks: true });
  const files: FileDiff[] = [];
  let insertions = 0;

  for (const entry of inspection.entries) {
    if (entry.symlink) continue; // 上传包不允许符号链接，inspectTree 已拒绝，这里兜底
    const fullPath = path.join(dir, entry.path);
    const content = await fs.promises.readFile(fullPath);
    const lineCount = countLines(content);
    const lineRanges: LineRange[] =
      lineCount > 0 && !isBinary(content)
        ? [{ startLine: 1, endLine: lineCount, additions: lineCount, deletions: 0 }]
        : [];
    files.push({
      path: entry.path,
      status: "added",
      insertions: lineCount,
      deletions: 0,
      lineRanges,
    });
    insertions += lineCount;
  }

  return {
    source,
    head: null,
    branches: [],
    commits: [],
    diff: {
      baseRef: "upload",
      filesChanged: files.length,
      insertions,
      deletions: 0,
      files,
    },
    tree: {
      fileCount: inspection.fileCount,
      totalBytes: inspection.totalBytes,
      largestFileBytes: inspection.largestFileBytes,
      files: inspection.entries.map((entry) => entry.path),
    },
    analyzedAt: new Date().toISOString(),
  };
}

