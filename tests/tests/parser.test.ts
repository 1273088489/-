// P2-04 测试输出解析器单元测试：node:test（TAP）/ vitest / jest / static-check。
import { describe, expect, it } from "vitest";
import {
  parseJestOutput,
  parseNodeTestOutput,
  parseStaticCheckOutput,
  parseTestOutput,
  parseVitestOutput,
} from "@/server/tests/parser";

describe("parseNodeTestOutput（TAP 13）", () => {
  it("解析全部通过：pass 计数、耗时与消息", () => {
    const stdout = [
      "TAP version 13",
      "ok 1 - adds 1+1",
      "ok 2 - subtracts",
      "1..2",
      "# tests 2",
      "# pass 2",
      "# fail 0",
      "# duration_ms 12.345",
    ].join("\n");
    const result = parseNodeTestOutput(stdout, "", 0);
    expect(result.passed).toBe(true);
    expect(result.counts).toEqual({ tests: 2, pass: 2, fail: 0, skipped: 0 });
    expect(result.durationMs).toBe(12);
    expect(result.message).toContain("2 通过");
    expect(result.failures).toEqual([]);
  });

  it("解析失败断言：fail 计数与失败明细", () => {
    const stdout = [
      "TAP version 13",
      "ok 1 - adds 1+1",
      "not ok 2 - subtracts",
      "  ---",
      "  message: expected 3 to equal 2",
      "  ...",
      "1..2",
      "# tests 2",
      "# pass 1",
      "# fail 1",
    ].join("\n");
    const result = parseNodeTestOutput(stdout, "", 0);
    expect(result.passed).toBe(false);
    expect(result.counts.fail).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("subtracts");
    expect(result.failures[0]).toContain("expected 3 to equal 2");
    expect(result.message).toContain("1 失败");
  });

  it("容忍目录模式下的 Subtest 分组标题（不计数）", () => {
    const stdout = [
      "TAP version 13",
      "# Subtest: /workspace/.quanzhan-tests-abc/sum.test.js",
      "ok 1 - adds",
      "1..1",
      "ok 1 - /workspace/.quanzhan-tests-abc/sum.test.js",
      "# duration_ms 5",
      "1..1",
      "# tests 1",
      "# pass 1",
      "# fail 0",
    ].join("\n");
    const result = parseNodeTestOutput(stdout, "", 0);
    expect(result.passed).toBe(true);
    expect(result.counts).toEqual({ tests: 1, pass: 1, fail: 0, skipped: 0 });
  });

  it("无断言输出时标记失败并附上输出", () => {
    const result = parseNodeTestOutput("", "", 0);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("未发现测试断言");
  });
});

describe("parseVitestOutput", () => {
  it("解析通过/失败断言与汇总行", () => {
    const stdout = [
      " ✓ sum adds numbers (1 ms)",
      " ✗ sum subtracts (2 ms)",
      "",
      " Test Files  1 failed (1)",
      "      Tests  1 passed | 1 failed (2)",
      "   Start at  12:00:00",
    ].join("\n");
    const result = parseVitestOutput(stdout, "", 0);
    expect(result.passed).toBe(false);
    expect(result.counts).toEqual({ tests: 2, pass: 1, fail: 1, skipped: 0 });
    expect(result.failures.join(" ")).toContain("sum subtracts");
  });
});

describe("parseJestOutput", () => {
  it("解析 ✓/✕ 与汇总行", () => {
    const stdout = [
      " PASS  src/sum.test.js",
      "  ✓ adds numbers",
      "  ✕ subtracts",
      "Tests:       1 failed, 1 passed, 2 total",
    ].join("\n");
    const result = parseJestOutput(stdout, "", 0);
    expect(result.passed).toBe(false);
    expect(result.counts).toEqual({ tests: 2, pass: 1, fail: 1, skipped: 0 });
    expect(result.failures.join(" ")).toContain("subtracts");
  });
});

describe("parseStaticCheckOutput / parseTestOutput", () => {
  it("static-check：退出码 0 通过，非 0 失败并带 stdout 说明", () => {
    const passed = parseStaticCheckOutput("PASS: 页面存在\nOK: 全部检查通过", "", 0, 42);
    expect(passed.passed).toBe(true);
    expect(passed.durationMs).toBe(42);
    expect(passed.message).toContain("全部检查通过");

    const failed = parseStaticCheckOutput("FAIL: 缺少 README", "", 1, 42);
    expect(failed.passed).toBe(false);
    expect(failed.counts.fail).toBe(1);
    expect(failed.failures[0]).toContain("缺少 README");
  });

  it("parseTestOutput 按框架分发；未知框架按退出码兜底", () => {
    expect(parseTestOutput("static-check", "ok", "", 0, 1).passed).toBe(true);
    expect(parseTestOutput("node:test", "ok 1 - a\n# tests 1\n# pass 1\n# fail 0", "", 0, 1).passed).toBe(true);
    expect(parseTestOutput("static-check" as never, "", "boom", 1, 1).passed).toBe(false);
  });
});
