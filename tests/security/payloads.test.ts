// P2-07 恶意 payload 回归：zip-slip / 符号链接 / 资源耗尽 / git 元数据。
// 压缩包解析与解包全部复用 P2-02 的纯 Node 中央目录解析（无系统 unzip）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractArchive, inspectTree } from "@/server/repo/archive";
import { REPO_LIMITS } from "@/server/repo/limits";
import { RepoError } from "@/server/repo/errors";
import { createZip } from "../repo/zip-writer";

const tempDirs: string[] = [];
function tempDir(prefix = "quanzhan-payload-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function expectRejected(zip: Buffer, code: string) {
  const dest = path.join(tempDir(), "out");
  const archivePath = path.join(tempDir(), "payload.zip");
  fs.writeFileSync(archivePath, zip);
  await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code });
  // 解包失败必须不留任何产物（防止部分写入）。
  expect(fs.existsSync(dest)).toBe(true);
  expect(fs.readdirSync(dest)).toHaveLength(0);
}

describe("恶意 zip payload", () => {
  it("zip-slip：../、深层 ../、绝对路径、盘符、反斜杠穿越全部拒绝", async () => {
    const cases = [
      { name: "../evil.txt", tag: "slip" },
      { name: "a/../../evil.txt", tag: "deep-slip" },
      { name: "/tmp/evil.txt", tag: "absolute" },
      { name: "C:\\windows\\evil.txt", tag: "drive" },
      { name: "..\\evil.txt", tag: "backslash-slip" },
      { name: "a/..\\evil.txt", tag: "mixed-slip" },
    ];
    for (const c of cases) {
      await expectRejected(createZip([{ name: c.name, content: "x" }]), "unsafe-path");
    }
  });

  it("符号链接条目与 .git 元数据：符号链接拒绝，.git 忽略且不落地", async () => {
    const dest = path.join(tempDir(), "out");
    const archivePath = path.join(tempDir(), "symlink.zip");
    fs.writeFileSync(archivePath, createZip([
      { name: "link", content: "/etc/passwd", isSymlink: true },
      { name: ".git/config", content: "[core]\n" },
      { name: "app.ts", content: "ok\n" },
    ]));
    await expect(extractArchive({ filePath: archivePath, archiveKind: "zip", destDir: dest })).rejects.toMatchObject({ code: "unsafe-path" });
    expect(fs.existsSync(path.join(dest, ".git"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "link"))).toBe(false);
  });

  it("资源耗尽：单文件超限、文件数超限拒绝，且失败不留产物", async () => {
    const big = Buffer.alloc(REPO_LIMITS.maxSingleFileBytes + 1, 0x61);
    await expectRejected(createZip([{ name: "big.bin", content: big, method: "stored" }]), "file-too-large");

    const many = Array.from({ length: REPO_LIMITS.maxFileCount + 1 }, (_, i) => ({ name: `f${i}.txt`, content: "x" }));
    await expectRejected(createZip(many), "too-many-files");
  });

  it("解包后权威复检：符号链接被 inspectTree 拒绝，普通树可遍历", async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, "esc"), { recursive: true });
    fs.writeFileSync(path.join(root, "esc", "f.txt"), "x");
    fs.symlinkSync("/etc/passwd", path.join(root, "esc", "link"));
    expect(() => inspectTree(root, { rejectSymlinks: true })).toThrow(RepoError);
    fs.unlinkSync(path.join(root, "esc", "link"));
    const inspection = inspectTree(root, { rejectSymlinks: true });
    expect(inspection.fileCount).toBe(1);
  });
});
