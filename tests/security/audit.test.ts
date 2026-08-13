// P2-07 安全审计模块：路径/参数净化规则与逃逸 payload 检测（不执行任何 payload）。
import { describe, expect, it } from "vitest";
import {
  auditFilePath,
  auditPaths,
  auditShellArg,
  looksLikeCommandInjection,
  ESCAPE_PAYLOADS,
  auditEscapePayloads,
} from "@/server/sandbox/security";

describe("auditFilePath / auditPaths", () => {
  it("安全相对路径通过，恶意路径全部命中", () => {
    expect(auditFilePath("src/app.ts")).toBeNull();
    expect(auditFilePath("a/b/c.txt")).toBeNull();
    expect(auditFilePath("../evil")).toBe("traversal");
    expect(auditFilePath("a/../../evil")).toBe("traversal");
    expect(auditFilePath("/etc/passwd")).toBe("absolute");
    expect(auditFilePath("C:\\x")).toBe("absolute");
    expect(auditFilePath("./x")).toBe("dot-prefix");
    expect(auditFilePath("a\0b")).toBe("nul");
    expect(auditFilePath("x".repeat(256))).toBe("segment-too-long");

    const result = auditPaths(["ok.txt", "../bad.txt", "ok2.txt"]);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.startsWith("traversal:"))).toBe(true);
  });
});

describe("auditShellArg / 命令注入特征", () => {
  it("拒绝空值、超长与控制字符", () => {
    expect(auditShellArg("npm")).toBeNull();
    expect(auditShellArg("")).toBe("empty");
    expect(auditShellArg("x".repeat(5000))).toBe("too-long");
    expect(auditShellArg("a\nb")).toBe("control");
  });

  it("命令注入 payload 全部被特征规则命中", () => {
    for (const item of ESCAPE_PAYLOADS) {
      expect(looksLikeCommandInjection(item.payload), item.name).toBe(true);
    }
  });

  it("审计所有逃逸 payload：每个至少命中一条检测原因", () => {
    const results = auditEscapePayloads();
    expect(results).toHaveLength(ESCAPE_PAYLOADS.length);
    for (const result of results) {
      expect(result.reasons.length, result.name).toBeGreaterThan(0);
    }
  });
});
