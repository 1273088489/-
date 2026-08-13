import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractArchive, inspectTree } from "@/server/repo/archive";
import { buildUploadSnapshot } from "@/server/repo/upload";
import { RepoError } from "@/server/repo/errors";
import { createZip } from "./zip-writer";

const tempDirs: string[] = [];
function tempDir(prefix = "quanzhan-archive-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeArchive(filePath: string, buffer: Buffer): void {
  fs.writeFileSync(filePath, buffer);
}

describe("extractArchive（zip）", () => {
  it("解包普通 zip（含嵌套目录与空文件）并产出树统计", async () => {
    const dest = path.join(tempDir(), "out");
    const zip = createZip([
      { name: "README.md", content: "# Demo\n\nhello\n" },
      { name: "src/app.ts", content: "line1\nline2\nline3\nline4\nline5" },
      { name: "src/empty.txt", content: "" },
      { name: "assets/", isDirectory: true },
    ]);
    const archivePath = path.join(tempDir(), "repo.zip");
    writeArchive(archivePath, zip);

    await extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest });

    const inspection = inspectTree(dest, { rejectSymlinks: true });
    expect(inspection.fileCount).toBe(3);
    expect(inspection.totalBytes).toBe(Buffer.byteLength("# Demo\n\nhello\n") + Buffer.byteLength("line1\nline2\nline3\nline4\nline5"));
    expect(inspection.entries.map((entry) => entry.path).sort()).toEqual(["README.md", "src/app.ts", "src/empty.txt"]);

    const snapshot = await buildUploadSnapshot(dest, { type: "archive", archiveName: "repo.zip", archiveKind: "zip" });
    expect(snapshot.head).toBeNull();
    expect(snapshot.diff.baseRef).toBe("upload");
    const app = snapshot.diff.files.find((file) => file.path === "src/app.ts");
    expect(app).toMatchObject({ status: "added", insertions: 5, deletions: 0 });
    expect(app?.lineRanges).toEqual([{ startLine: 1, endLine: 5, additions: 5, deletions: 0 }]);
  });

  it("拒绝 zip-slip（../ 与绝对路径）与符号链接条目", async () => {
    const cases: Array<{ name: string; label: string }> = [
      { name: "../evil.txt", label: "路径穿越" },
      { name: "a/../../evil.txt", label: "深层穿越" },
      { name: "/tmp/evil.txt", label: "绝对路径" },
      { name: "C:\\evil.txt", label: "盘符" },
      { name: "link", label: "符号链接" },
    ];
    for (const c of cases) {
      const dest = path.join(tempDir(), "out");
      const zip = createZip([{ name: "ok.txt", content: "ok" }, c.name === "link" ? { name: c.name, content: "target", isSymlink: true } : { name: c.name, content: "evil" }]);
      const archivePath = path.join(tempDir(), "evil.zip");
      writeArchive(archivePath, zip);
      await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toThrow(RepoError);
      await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code: "unsafe-path" });
      expect(fs.existsSync(path.join(dest, "ok.txt"))).toBe(false);
    }
  });

  it("忽略 .git 元数据条目", async () => {
    const dest = path.join(tempDir(), "out");
    const zip = createZip([
      { name: ".git/config", content: "[core]\n" },
      { name: ".git/HEAD", content: "ref: refs/heads/main\n" },
      { name: "src/app.ts", content: "const a = 1;\n" },
    ]);
    const archivePath = path.join(tempDir(), "with-git.zip");
    writeArchive(archivePath, zip);
    await extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest });
    const entries = inspectTree(dest, { rejectSymlinks: true }).entries.map((entry) => entry.path);
    expect(entries).toEqual(["src/app.ts"]);
    expect(fs.existsSync(path.join(dest, ".git"))).toBe(false);
  });

  it("拒绝单文件超过 1MB", async () => {
    const dest = path.join(tempDir(), "out");
    const big = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const zip = createZip([{ name: "big.txt", content: big, method: "stored" }]);
    const archivePath = path.join(tempDir(), "big.zip");
    writeArchive(archivePath, zip);
    await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code: "file-too-large" });
  });

  it("拒绝文件数超过 2000", async () => {
    const dest = path.join(tempDir(), "out");
    const entries = Array.from({ length: 2001 }, (_, index) => ({ name: `f${index}.txt`, content: "x" }));
    const zip = createZip(entries);
    const archivePath = path.join(tempDir(), "many.zip");
    writeArchive(archivePath, zip);
    await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code: "too-many-files" });
  });

  it("拒绝损坏的 zip", async () => {
    const dest = path.join(tempDir(), "out");
    const archivePath = path.join(tempDir(), "broken.zip");
    writeArchive(archivePath, Buffer.from("not a zip file at all"));
    await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code: "invalid-archive" });
  });
});

describe("extractArchive（tar.gz）", () => {
  function createTarGz(files: Array<{ name: string; content?: string }>, dest: string): string {
    const staging = path.join(tempDir(), "tar-staging");
    fs.mkdirSync(staging, { recursive: true });
    for (const file of files) {
      if (file.name.endsWith("/")) {
        fs.mkdirSync(path.join(staging, file.name), { recursive: true });
      } else {
        const full = path.join(staging, file.name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, file.content ?? "");
      }
    }
    const archivePath = path.join(dest, "repo.tar.gz");
    execFileSync("tar", ["-czf", archivePath, "-C", staging, ...files.map((file) => file.name)]);
    return archivePath;
  }

  it("解包普通 tar.gz", async () => {
    const dest = path.join(tempDir(), "out");
    const archivePath = createTarGz([
      { name: "README.md", content: "# Demo\n" },
      { name: "src/app.ts", content: "const a = 1;\nconst b = 2;\n" },
    ], tempDir());
    await extractArchive({ filePath: archivePath, archiveKind: "tar.gz", destDir: dest });
    const inspection = inspectTree(dest, { rejectSymlinks: true });
    expect(inspection.fileCount).toBe(2);
    expect(inspection.entries.map((entry) => entry.path).sort()).toEqual(["README.md", "src/app.ts"]);
  });

  it("拒绝包含符号链接的 tar.gz", async () => {
    const staging = path.join(tempDir(), "tar-link-staging");
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, "target.txt"), "secret");
    fs.symlinkSync("target.txt", path.join(staging, "link.txt"));
    const archivePath = path.join(tempDir(), "link.tar.gz");
    execFileSync("tar", ["-czf", archivePath, "-C", staging, "target.txt", "link.txt"]);
    const dest = path.join(tempDir(), "out");
    await expect(extractArchive({ filePath: archivePath, archiveKind: "tar.gz", destDir: dest })).rejects.toMatchObject({ code: "unsafe-path" });
  });

  it("拒绝非 gzip 内容", async () => {
    const archivePath = path.join(tempDir(), "fake.tar.gz");
    writeArchive(archivePath, Buffer.from("plain text"));
    const dest = path.join(tempDir(), "out");
    await expect(extractArchive({ filePath: archivePath, archiveKind: "tar.gz", destDir: dest })).rejects.toMatchObject({ code: "invalid-archive" });
  });
});
