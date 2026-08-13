import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeRepo, cloneRepo } from "@/server/repo/git";
import { RepoError } from "@/server/repo/errors";

const tempDirs: string[] = [];
function tempDir(prefix = "quanzhan-git-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function git(dir: string, args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function commitAll(dir: string, message: string): void {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", message]);
}

function initRepo(dir: string, branch = "main"): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", branch]);
  git(dir, ["config", "user.name", "Test Learner"]);
  git(dir, ["config", "user.email", "learner@example.com"]);
}

const URL = "https://github.com/acme/learner-project.git";

describe("analyzeRepo（本地 fixture 仓库）", () => {
  it("解析分支、最近提交、diff 统计与变更文件行号", async () => {
    const repo = path.join(tempDir(), "repo");
    initRepo(repo);
    writeFiles(repo, { "README.md": "# 项目\n\n说明\n" });
    commitAll(repo, "init readme");
    writeFiles(repo, { "src/app.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\n" });
    commitAll(repo, "add app logic");
    git(repo, ["checkout", "-b", "feature/board"]);
    writeFiles(repo, { "src/board.ts": "export const board = [];\n" });
    commitAll(repo, "add board module");
    const baseCommit = git(repo, ["rev-parse", "HEAD^"]).trim();

    const snapshot = await analyzeRepo(repo, { type: "url", url: URL });

    expect(snapshot.source).toEqual({ type: "url", url: URL });
    expect(snapshot.head).toMatchObject({ branch: "feature/board", subject: "add board module" });
    expect(snapshot.head?.commitHash).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.commits.map((commit) => commit.subject)).toEqual(["add board module", "add app logic", "init readme"]);
    expect(snapshot.branches.map((branch) => branch.name).sort()).toEqual(["feature/board", "main"]);
    expect(snapshot.branches.find((branch) => branch.name === "feature/board")?.isHead).toBe(true);
    expect(snapshot.branches.find((branch) => branch.name === "main")?.isHead).toBe(false);

    // HEAD 有父提交：base 是父提交 hash，diff 只含最后一次提交的变更。
    expect(snapshot.diff.baseRef).toBe(baseCommit);
    expect(snapshot.diff.filesChanged).toBe(1);
    expect(snapshot.diff.insertions).toBe(1);
    expect(snapshot.diff.files).toEqual([
      {
        path: "src/board.ts",
        status: "added",
        insertions: 1,
        deletions: 0,
        lineRanges: [{ startLine: 1, endLine: 1, additions: 1, deletions: 0 }],
      },
    ]);
    expect(snapshot.tree.fileCount).toBe(3);
  });

  it("修改文件时解析 hunk 行区间", async () => {
    const repo = path.join(tempDir(), "repo");
    initRepo(repo);
    writeFiles(repo, { "app.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\n" });
    commitAll(repo, "init");
    writeFiles(repo, { "app.ts": "const a = 1;\nconst b = 2;\nconst c = 30;\nconst d = 4;\nconst e = 5;\n" });
    commitAll(repo, "tweak c");

    const snapshot = await analyzeRepo(repo, { type: "url", url: URL });
    const file = snapshot.diff.files.find((item) => item.path === "app.ts");
    expect(file).toBeDefined();
    expect(file).toMatchObject({ path: "app.ts", status: "modified", insertions: 1, deletions: 1 });
    expect(file?.lineRanges).toEqual([{ startLine: 3, endLine: 3, additions: 1, deletions: 1 }]);
  });

  it("根提交（无父提交）以空树为基线，全部文件视为新增", async () => {
    const repo = path.join(tempDir(), "repo");
    initRepo(repo);
    writeFiles(repo, { "README.md": "readme\n", "src/index.js": "console.log(1);\n" });
    commitAll(repo, "first commit");

    const snapshot = await analyzeRepo(repo, { type: "url", url: URL });
    expect(snapshot.diff.baseRef).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.diff.filesChanged).toBe(2);
    expect(snapshot.diff.files.every((file) => file.status === "added")).toBe(true);
    const readme = snapshot.diff.files.find((file) => file.path === "README.md");
    expect(readme?.lineRanges).toEqual([{ startLine: 1, endLine: 1, additions: 1, deletions: 0 }]);
  });

  it("拒绝非 Git 目录", async () => {
    const dir = path.join(tempDir(), "not-git");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.txt"), "x");
    await expect(analyzeRepo(dir, { type: "url", url: URL })).rejects.toMatchObject({ code: "not-a-git-repo" });
  });
});

describe("cloneRepo（浅克隆）", () => {
  it("浅克隆保留分支 tip 且 diff 以空树为基线", async () => {
    const origin = path.join(tempDir(), "origin");
    initRepo(origin);
    writeFiles(origin, { "README.md": "# Demo\n" });
    commitAll(origin, "init");
    git(origin, ["checkout", "-b", "feature/x"]);
    writeFiles(origin, { "src/x.ts": "export const x = 1;\n" });
    commitAll(origin, "feature x");

    const clone = path.join(tempDir(), "clone");
    await cloneRepo({ url: `file://${origin}`, destDir: clone });

    const snapshot = await analyzeRepo(clone, { type: "url", url: URL });
    expect(snapshot.commits).toHaveLength(1); // depth 1
    expect(snapshot.branches.map((branch) => branch.name)).toEqual(
      expect.arrayContaining(["origin/main", "origin/feature/x"]),
    );
    expect(snapshot.branches.some((branch) => branch.isRemote && branch.isHead)).toBe(true);
    expect(snapshot.diff.filesChanged).toBe(2); // 空树基线：整个仓库视为新增
    expect(snapshot.diff.files.every((file) => file.status === "added")).toBe(true);
    expect(snapshot.tree.files.sort()).toEqual(["README.md", "src/x.ts"]);
  });
});
