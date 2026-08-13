import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestRepository } from "@/server/repo/ingest";
import { RepoError } from "@/server/repo/errors";
import { createZip } from "./zip-writer";

const tempDirs: string[] = [];
function tempDir(prefix = "quanzhan-ingest-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function expectTempRootClean(root: string): void {
  expect(fs.readdirSync(root)).toEqual([]);
}

describe("ingestRepository", () => {
  it("解包上传压缩包并清理临时目录", async () => {
    const tempRoot = path.join(tempDir(), "repo-tmp");
    fs.mkdirSync(tempRoot);
    const zipPath = path.join(tempDir(), "repo.zip");
    fs.writeFileSync(zipPath, createZip([
      { name: "README.md", content: "# Demo\n" },
      { name: "src/app.ts", content: "const a = 1;\nconst b = 2;\n" },
    ]));

    const snapshot = await ingestRepository({ type: "archive", filePath: zipPath, archiveName: "repo.zip" }, { tempDirRoot: tempRoot });

    expect(snapshot.source).toEqual({ type: "archive", archiveName: "repo.zip", archiveKind: "zip" });
    expect(snapshot.tree.fileCount).toBe(2);
    expect(snapshot.diff.filesChanged).toBe(2);
    expect(snapshot.diff.baseRef).toBe("upload");
    expect(snapshot.diff.files.find((file) => file.path === "src/app.ts")?.lineRanges).toEqual([
      { startLine: 1, endLine: 2, additions: 2, deletions: 0 },
    ]);
    expectTempRootClean(tempRoot); // 已清理
  });

  it("URL 提交：校验通过后 clone 并在临时目录分析", async () => {
    const clone = vi.fn(async (input: { url: string; destDir: string }) => {
      fs.mkdirSync(input.destDir, { recursive: true });
      execFileSync("git", ["-C", input.destDir, "init", "-b", "main"], { encoding: "utf8" });
      execFileSync("git", ["-C", input.destDir, "config", "user.name", "T"], { encoding: "utf8" });
      execFileSync("git", ["-C", input.destDir, "config", "user.email", "t@example.com"], { encoding: "utf8" });
      fs.writeFileSync(path.join(input.destDir, "a.txt"), "hello\n");
      execFileSync("git", ["-C", input.destDir, "add", "-A"], { encoding: "utf8" });
      execFileSync("git", ["-C", input.destDir, "commit", "-m", "init"], { encoding: "utf8" });
    });

    const snapshot = await ingestRepository(
      { type: "url", url: "https://github.com/acme/repo.git" },
      { clone },
    );

    expect(clone).toHaveBeenCalledWith(expect.objectContaining({ url: "https://github.com/acme/repo.git" }));
    expect(snapshot.head).toMatchObject({ branch: "main", subject: "init" });
    expect(snapshot.tree.files).toEqual(["a.txt"]);
  });

  it("拒绝非 https URL，且不调用 clone", async () => {
    const clone = vi.fn();
    await expect(
      ingestRepository({ type: "url", url: "git@github.com:acme/repo.git" }, { clone }),
    ).rejects.toMatchObject({ code: "invalid-url" });
    expect(clone).not.toHaveBeenCalled();
  });

  it("拒绝超过 50MB 的压缩包（不调用 extract）", async () => {
    const archivePath = path.join(tempDir(), "huge.zip");
    fs.writeFileSync(archivePath, Buffer.from("x"));
    fs.truncateSync(archivePath, 50 * 1024 * 1024 + 1); // 稀疏文件：逻辑大小超限
    await expect(
      ingestRepository({ type: "archive", filePath: archivePath, archiveName: "huge.zip" }),
    ).rejects.toMatchObject({ code: "archive-too-large" });
  });

  it("分析失败时也清理临时目录", async () => {
    const tempRoot = path.join(tempDir(), "repo-tmp");
    fs.mkdirSync(tempRoot);
    const zipPath = path.join(tempDir(), "evil.zip");
    fs.writeFileSync(zipPath, createZip([{ name: "../evil.txt", content: "x" }]));
    await expect(
      ingestRepository({ type: "archive", filePath: zipPath, archiveName: "evil.zip" }, { tempDirRoot: tempRoot }),
    ).rejects.toMatchObject({ code: "unsafe-path" });
    expectTempRootClean(tempRoot);
  });

  it("clone 失败抛出 clone-failed", async () => {
    await expect(
      ingestRepository(
        { type: "url", url: "https://github.com/acme/nonexistent-repo-xyz.git" },
        { clone: async () => { throw new RepoError("clone-failed"); } },
      ),
    ).rejects.toMatchObject({ code: "clone-failed" });
  });
});
