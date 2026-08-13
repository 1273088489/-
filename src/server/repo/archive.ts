// P2-02 压缩包解包与文件树检查。
// - zip：纯 Node 解析中央目录（条目名/大小/符号链接标记），逐条解压写入，
//   不依赖系统 unzip；解压前校验路径穿越、符号链接与大小限制。
// - tar.gz：系统 tar 先列出条目做同样校验，再解包；解包后再次全树校验。
// 解包只做数据还原，绝不执行包内代码。
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { RepoError } from "./errors";
import { runCommand } from "./exec";
import { REPO_LIMITS, isGitMetadataPath, isUnsafeArchivePath } from "./limits";
import type { ArchiveKind } from "./types";

// ---------------------------------------------------------------------------
// ZIP：中央目录解析（标准格式，不支持 Zip64，体积上限已由上传限制兜底）
// ---------------------------------------------------------------------------

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;
const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATE = 8;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
  isSymlink: boolean;
  localHeaderOffset: number;
}

function parseZipCentralDirectory(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) throw new RepoError("invalid-archive", undefined, "zip 文件过小");
  // EOCD 位于文件末尾（最多向后 64KB+22 字节内）。
  const searchStart = Math.max(0, buffer.length - 22 - 65535);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new RepoError("invalid-archive", undefined, "未找到 zip 中央目录");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new RepoError("invalid-archive", undefined, "不支持 Zip64 压缩包");
  }
  if (cdOffset + cdSize > eocdOffset) throw new RepoError("invalid-archive", undefined, "zip 中央目录越界");

  const entries: ZipEntry[] = [];
  let offset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIG) {
      throw new RepoError("invalid-archive", undefined, "zip 中央目录条目损坏");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttrs = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const mode = (externalAttrs >>> 16) & 0xffff;

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith("/") || (mode & 0o170000) === 0o040000,
      isSymlink: (mode & 0o170000) === 0o120000,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function validateEntries(entries: ZipEntry[]): ZipEntry[] {
  let totalBytes = 0;
  let fileCount = 0;
  const safe: ZipEntry[] = [];
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, "/");
    if (isGitMetadataPath(normalized)) continue; // 忽略 .git，防止泄露历史
    if (entry.isSymlink) throw new RepoError("unsafe-path", undefined, `符号链接条目：${entry.name}`);
    if (isUnsafeArchivePath(entry.name)) throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    if (isUnsafeArchivePath(normalized)) throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    if (normalized.startsWith("./") || normalized.split("/").some((segment) => segment.length === 0 && normalized.includes("//"))) {
      throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    }
    if (/\0/.test(normalized) || normalized.split("/").some((segment) => segment.length > 255)) {
      throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    }
    if (entry.isDirectory) {
      safe.push(entry);
      continue;
    }
    if (entry.uncompressedSize > REPO_LIMITS.maxSingleFileBytes) {
      throw new RepoError("file-too-large", undefined, entry.name);
    }
    totalBytes += entry.uncompressedSize;
    fileCount += 1;
    if (totalBytes > REPO_LIMITS.maxExtractedBytes) {
      throw new RepoError("archive-too-large", undefined, `解压后总大小 ${totalBytes}`);
    }
    if (fileCount > REPO_LIMITS.maxFileCount) throw new RepoError("too-many-files");
    safe.push(entry);
  }
  return safe;
}

function extractZip(buffer: Buffer, entries: ZipEntry[], destDir: string): void {
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, "/").replace(/^\.\//, "");
    if (isUnsafeArchivePath(normalized) || normalized.startsWith("./") || /\0/.test(normalized)) {
      throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    }
    const destPath = path.join(destDir, normalized);
    if (path.dirname(destPath) !== destDir && !destPath.startsWith(destDir + path.sep)) {
      // path.join 的归一化语义可能把相对段折叠到 destDir 外；双保险拒绝。
      throw new RepoError("unsafe-path", undefined, `解包目标越界：${entry.name}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (entry.localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localHeaderOffset) !== ZIP_LOCAL_SIG) {
      throw new RepoError("invalid-archive", undefined, `本地头损坏：${entry.name}`);
    }
    const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    if (dataStart + entry.compressedSize > buffer.length) {
      throw new RepoError("invalid-archive", undefined, `数据越界：${entry.name}`);
    }
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
    let data: Buffer;
    if (entry.method === ZIP_METHOD_STORED) {
      data = compressed;
    } else if (entry.method === ZIP_METHOD_DEFLATE) {
      try {
        data = zlib.inflateRawSync(compressed);
      } catch {
        throw new RepoError("invalid-archive", undefined, `解压失败：${entry.name}`);
      }
    } else {
      throw new RepoError("invalid-archive", undefined, `不支持的压缩方法：${entry.name}`);
    }
    if (data.length !== entry.uncompressedSize) {
      throw new RepoError("invalid-archive", undefined, `大小不一致：${entry.name}`);
    }
    fs.writeFileSync(destPath, data, { mode: 0o644 });
  }
}

// ---------------------------------------------------------------------------
// tar.gz：系统 tar 列出 + 校验 + 解包
// ---------------------------------------------------------------------------

interface TarEntry {
  name: string;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

function parseTarListing(stdout: string): TarEntry[] {
  const entries: TarEntry[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (fields.length < 6) throw new RepoError("invalid-archive", undefined, "tar 列表格式无法解析");
    const perms = fields[0];
    const size = Number.parseInt(fields[2], 10);
    if (!Number.isFinite(size) || size < 0) throw new RepoError("invalid-archive", undefined, "tar 条目大小无效");
    // 名称可能含空格：第 6 个字段起为名称（符号链接会附加 " -> target"，随后拒绝）。
    const name = fields.slice(5).join(" ");
    entries.push({
      name,
      size,
      isDirectory: name.endsWith("/") || perms.startsWith("d"),
      isSymlink: perms.startsWith("l"),
    });
  }
  return entries;
}

function validateTarEntries(entries: TarEntry[]): void {
  let totalBytes = 0;
  let fileCount = 0;
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, "/").replace(/ -> .*$/, "");
    if (isGitMetadataPath(normalized)) continue;
    if (entry.isSymlink) throw new RepoError("unsafe-path", undefined, `符号链接条目：${entry.name}`);
    if (isUnsafeArchivePath(normalized)) throw new RepoError("unsafe-path", undefined, `不安全路径：${entry.name}`);
    if (entry.isDirectory) continue;
    if (entry.size > REPO_LIMITS.maxSingleFileBytes) throw new RepoError("file-too-large", undefined, entry.name);
    totalBytes += entry.size;
    fileCount += 1;
    if (totalBytes > REPO_LIMITS.maxExtractedBytes) throw new RepoError("archive-too-large", undefined, `解压后总大小 ${totalBytes}`);
    if (fileCount > REPO_LIMITS.maxFileCount) throw new RepoError("too-many-files");
  }
}

export interface ExtractArchiveInput {
  filePath: string;
  archiveKind: ArchiveKind;
  destDir: string;
  tarBinary?: string;
}

/** 解包到 destDir；解包前/后均做路径与大小校验。 */
export async function extractArchive(input: ExtractArchiveInput): Promise<void> {
  if (!fs.existsSync(input.filePath)) throw new RepoError("io-error", undefined, "压缩包文件不存在");
  const stat = fs.statSync(input.filePath);
  if (stat.size > REPO_LIMITS.maxArchiveBytes) throw new RepoError("archive-too-large");
  fs.mkdirSync(input.destDir, { recursive: true });

  if (input.archiveKind === "zip") {
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(input.filePath);
    } catch (error) {
      throw new RepoError("io-error", undefined, error instanceof Error ? error.message : String(error));
    }
    const entries = validateEntries(parseZipCentralDirectory(buffer));
    extractZip(buffer, entries, input.destDir);
  } else {
    const listResult = await runCommand(input.tarBinary ?? "tar", ["-tvzf", input.filePath], {
      timeoutMs: 30_000,
      maxOutputBytes: REPO_LIMITS.maxCommandOutputBytes,
    });
    if (listResult.code !== 0) {
      throw new RepoError("invalid-archive", undefined, listResult.stderr.trim() || "tar 列表失败");
    }
    validateTarEntries(parseTarListing(listResult.stdout));
    const extractResult = await runCommand(
      input.tarBinary ?? "tar",
      ["-xzf", input.filePath, "-C", input.destDir, "--no-same-owner", "--no-same-permissions"],
      { timeoutMs: 30_000, maxOutputBytes: REPO_LIMITS.maxCommandOutputBytes },
    );
    if (extractResult.code !== 0) {
      throw new RepoError("invalid-archive", undefined, extractResult.stderr.trim() || "tar 解包失败");
    }
  }

  // 解包后的权威校验：文件数/大小/符号链接（防声明与实际不一致的压缩炸弹）。
  inspectTree(input.destDir, { rejectSymlinks: true });
}

// ---------------------------------------------------------------------------
// 文件树检查（clone 产物与解包产物共用）
// ---------------------------------------------------------------------------

export interface TreeEntry {
  path: string;
  bytes: number;
  symlink: boolean;
}

export interface TreeInspection {
  entries: TreeEntry[];
  fileCount: number;
  totalBytes: number;
  largestFileBytes: number;
}

/**
 * 递归统计文件树并强制限制。
 * - 始终忽略 .git 元数据；
 * - rejectSymlinks=true 用于上传包（解包产物不允许符号链接）；
 * - 不跟随符号链接，避免读取仓库外路径。
 */
export function inspectTree(dir: string, options: { rejectSymlinks?: boolean } = {}): TreeInspection {
  const entries: TreeEntry[] = [];
  let totalBytes = 0;
  let largestFileBytes = 0;

  const walk = (current: string, relative: string) => {
    const items = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const item of items) {
      const relPath = relative ? `${relative}/${item.name}` : item.name;
      if (isGitMetadataPath(relPath)) continue;
      const fullPath = path.join(current, item.name);
      const stats = fs.lstatSync(fullPath);
      if (stats.isSymbolicLink()) {
        if (options.rejectSymlinks) throw new RepoError("unsafe-path", undefined, `符号链接：${relPath}`);
        entries.push({ path: relPath, bytes: 0, symlink: true });
        continue;
      }
      if (stats.isDirectory()) {
        walk(fullPath, relPath);
        continue;
      }
      if (!stats.isFile()) continue;
      if (stats.size > REPO_LIMITS.maxSingleFileBytes) {
        throw new RepoError("file-too-large", undefined, relPath);
      }
      entries.push({ path: relPath, bytes: stats.size, symlink: false });
      totalBytes += stats.size;
      largestFileBytes = Math.max(largestFileBytes, stats.size);
      if (entries.length > REPO_LIMITS.maxFileCount) throw new RepoError("too-many-files");
    }
  };

  walk(dir, "");
  if (totalBytes > REPO_LIMITS.maxExtractedBytes) {
    throw new RepoError("archive-too-large", undefined, `总大小 ${totalBytes} 字节`);
  }
  return {
    entries,
    fileCount: entries.filter((entry) => !entry.symlink).length,
    totalBytes,
    largestFileBytes,
  };
}
