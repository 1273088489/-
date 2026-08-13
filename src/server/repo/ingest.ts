// P2-02 仓库接收编排：临时目录内 clone/解包 → 分析 → 清理。
// 主进程只解析元数据，不执行仓库内代码（沙箱执行见 P2-03）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoError } from "./errors";
import { cloneRepo, analyzeRepo } from "./git";
import { extractArchive } from "./archive";
import { buildUploadSnapshot } from "./upload";
import { detectArchiveKind, validateRepoUrl, REPO_LIMITS } from "./limits";
import type { RepoSnapshot } from "./types";

export type IngestSource =
  | { type: "url"; url: string }
  | { type: "archive"; filePath: string; archiveName: string };

export interface IngestDeps {
  clone?: typeof cloneRepo;
  extract?: typeof extractArchive;
  validateUrl?: typeof validateRepoUrl;
  tempDirRoot?: string;
}

/**
 * 接收并解析仓库：在隔离临时目录内 clone/解包，分析后返回 RepoSnapshot，
 * 无论成功失败都清理临时目录。
 */
export async function ingestRepository(input: IngestSource, deps: IngestDeps = {}): Promise<RepoSnapshot> {
  const validateUrl = deps.validateUrl ?? validateRepoUrl;
  const clone = deps.clone ?? cloneRepo;
  const extract = deps.extract ?? extractArchive;

  const workDir = fs.mkdtempSync(path.join(deps.tempDirRoot ?? os.tmpdir(), "quanzhan-repo-"));
  try {
    if (input.type === "url") {
      const check = validateUrl(input.url);
      if (!check.ok) throw new RepoError("invalid-url", check.reason);
      await clone({ url: check.url, destDir: workDir });
      return await analyzeRepo(workDir, { type: "url", url: check.url });
    }

    const archiveKind = detectArchiveKind(input.archiveName);
    if (!archiveKind) throw new RepoError("invalid-archive");
    const stat = fs.statSync(input.filePath);
    if (stat.size > REPO_LIMITS.maxArchiveBytes) throw new RepoError("archive-too-large");
    await extract({ filePath: input.filePath, archiveKind, destDir: workDir });
    return await buildUploadSnapshot(workDir, {
      type: "archive",
      archiveName: input.archiveName,
      archiveKind,
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
