// P2-07 路径安全基元回归：路径穿越 / 绝对路径 / 盘符 / NUL / 超长段。
import { describe, expect, it } from "vitest";
import { isUnsafeArchivePath } from "@/server/repo";
import { assertSafeRelativePath } from "@/server/tests/workspace";

describe("路径穿越 / 绝对路径 / 盘符（跨模块基元）", () => {
  it("拒绝路径穿越、绝对路径与盘符（含反斜杠变体）", () => {
    expect(isUnsafeArchivePath("../evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("a/../../evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("..\\evil.txt")).toBe(true);
    expect(isUnsafeArchivePath("/etc/passwd")).toBe(true);
    expect(isUnsafeArchivePath("C:\\windows\\x")).toBe(true);
    expect(isUnsafeArchivePath("")).toBe(true);
    expect(isUnsafeArchivePath("./ok.txt")).toBe(true);
    expect(isUnsafeArchivePath("dir/file.txt")).toBe(false);
  });

  it("测试注入路径拒绝绝对路径、.. 与 NUL", () => {
    expect(() => assertSafeRelativePath("a/../../x")).toThrow();
    expect(() => assertSafeRelativePath("/abs/x.mjs")).toThrow();
    expect(() => assertSafeRelativePath("a\0b.mjs")).toThrow();
    expect(assertSafeRelativePath("check.mjs")).toBe("check.mjs");
  });
});
