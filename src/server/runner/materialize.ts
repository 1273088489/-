// P2-03 仓库快照 materialize：在隔离临时目录重新克隆/解包，供沙箱执行使用。
// 复用 P2-02 的 cloneRepo/extractArchive（仅数据还原，不执行仓库代码），
// 与 ingestRepository 的分析路径解耦（P2-02 的 ingest 会清理临时目录，故这里重新物化）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneRepo, extractArchive, detectArchiveKind, RepoError } from "@/server/repo";
import type { IngestSource } from "@/server/repo/ingest";

export interface MaterializedProject {
  projectDir: string;
  cleanup: () => void;
}

/**
 * 把仓库源物化为宿主临时目录（调用方负责 cleanup）。
 * - url：浅克隆（depth=1）
 * - archive：解包（zip/tar.gz）
 */
export async function materializeRepository(source: IngestSource): Promise<MaterializedProject> {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-run-"));
  try {
    if (source.type === "url") {
      await cloneRepo({ url: source.url, destDir: projectDir });
    } else {
      const archiveKind = detectArchiveKind(source.archiveName);
      if (!archiveKind) throw new RepoError("invalid-archive");
      await extractArchive({ filePath: source.filePath, archiveKind, destDir: projectDir });
    }
    return {
      projectDir,
      cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    throw error;
  }
}
