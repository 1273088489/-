import { describe, expect, it } from "vitest";
import { detectArchiveKind, isGitMetadataPath, isUnsafeArchivePath, validateRepoUrl } from "@/server/repo/limits";

describe("validateRepoUrl（仅 https，禁内网/账号密码）", () => {
  it("接受公开 https 仓库地址", () => {
    expect(validateRepoUrl("https://github.com/acme/repo.git")).toEqual({
      ok: true,
      url: "https://github.com/acme/repo.git",
    });
    expect(validateRepoUrl("  https://gitlab.com/group/sub/repo  ").ok).toBe(true);
  });

  it("拒绝非 https 协议（http/ssh/git/file/ftp）", () => {
    expect(validateRepoUrl("http://github.com/acme/repo.git").ok).toBe(false);
    expect(validateRepoUrl("ssh://git@github.com/acme/repo.git").ok).toBe(false);
    expect(validateRepoUrl("git@github.com:acme/repo.git").ok).toBe(false);
    expect(validateRepoUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateRepoUrl("ftp://example.com/repo").ok).toBe(false);
  });

  it("拒绝携带账号密码或指向本机/内网", () => {
    expect(validateRepoUrl("https://user:pass@github.com/acme/repo.git").ok).toBe(false);
    expect(validateRepoUrl("https://localhost/acme/repo").ok).toBe(false);
    expect(validateRepoUrl("https://127.0.0.1/repo").ok).toBe(false);
    expect(validateRepoUrl("https://10.0.0.5/repo").ok).toBe(false);
    expect(validateRepoUrl("https://192.168.1.10/repo").ok).toBe(false);
    expect(validateRepoUrl("https://172.16.0.1/repo").ok).toBe(false);
    expect(validateRepoUrl("https://172.31.255.254/repo").ok).toBe(false);
    expect(validateRepoUrl("https://172.32.0.1/repo").ok).toBe(true);
  });

  it("拒绝空值、过长与非法地址", () => {
    expect(validateRepoUrl("").ok).toBe(false);
    expect(validateRepoUrl("   ").ok).toBe(false);
    expect(validateRepoUrl("https://").ok).toBe(false);
    expect(validateRepoUrl("not a url").ok).toBe(false);
    expect(validateRepoUrl(`https://example.com/${"a".repeat(2100)}`).ok).toBe(false);
  });
});

describe("detectArchiveKind", () => {
  it("识别 zip / tar.gz / tgz，拒绝其他格式", () => {
    expect(detectArchiveKind("repo.zip")).toBe("zip");
    expect(detectArchiveKind("REPO.ZIP")).toBe("zip");
    expect(detectArchiveKind("repo.tar.gz")).toBe("tar.gz");
    expect(detectArchiveKind("repo.tgz")).toBe("tar.gz");
    expect(detectArchiveKind("repo.rar")).toBeNull();
    expect(detectArchiveKind("repo.tar")).toBeNull();
    expect(detectArchiveKind("repo.zip.exe")).toBeNull();
    expect(detectArchiveKind("")).toBeNull();
  });
});

describe("路径安全与 git 元数据", () => {
  it("拒绝路径穿越、绝对路径与盘符", () => {
    expect(isUnsafeArchivePath("../evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("a/../../evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("/etc/passwd")).toBe(true);
    expect(isUnsafeArchivePath("C:\\windows\\system32\\x")).toBe(true);
    expect(isUnsafeArchivePath("..\\evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("a/b/c.txt")).toBe(false);
    expect(isUnsafeArchivePath("./a.txt")).toBe(true);
    expect(isUnsafeArchivePath("dir/")).toBe(false);
  });

  it("识别 .git 元数据路径", () => {
    expect(isGitMetadataPath(".git/config")).toBe(true);
    expect(isGitMetadataPath(".git")).toBe(true);
    expect(isGitMetadataPath("src/.git/HEAD")).toBe(true);
    expect(isGitMetadataPath("src/index.ts")).toBe(false);
  });
});
