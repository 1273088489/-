// P2-04 测试输出解析器：把 vitest / jest / node:test / static-check 的输出
// 归一化为每个用例的 pass/fail/duration/message 结构化结果。
// 解析只依赖输出文本（外部文本视为不可信输入，仅提取结构，不执行）。
import type { NormalizedTestResult, TestFramework } from "./types";

export const EMPTY_RESULT: NormalizedTestResult = {
  passed: false,
  durationMs: 0,
  message: "未产生测试输出",
  counts: { tests: 0, pass: 0, fail: 0, skipped: 0 },
  failures: [],
};

function summarize(counts: { tests: number; pass: number; fail: number; skipped: number }, durationMs: number): string {
  return `共 ${counts.tests} 项断言：${counts.pass} 通过 / ${counts.fail} 失败 / ${counts.skipped} 跳过（${durationMs}ms）`;
}

function tail(text: string, maxLines = 12): string {
  return text.split("\n").filter((line) => line.trim().length > 0).slice(-maxLines).join("\n");
}

// ---------------------------------------------------------------------------
// node:test（TAP 13）
// ---------------------------------------------------------------------------

interface TapState {
  counts: { tests: number; pass: number; fail: number; skipped: number };
  failures: string[];
  durationMs: number;
}

function newTapState(): TapState {
  return { counts: { tests: 0, pass: 0, fail: 0, skipped: 0 }, failures: [], durationMs: 0 };
}

/** 解析 node --test 的 TAP 输出（单文件运行；同时容忍目录模式下的 Subtest 包裹）。 */
export function parseNodeTestOutput(stdout: string, stderr: string, fallbackDurationMs = 0): NormalizedTestResult {
  const state = newTapState();
  const lines = `${stdout}\n${stderr}`.split("\n");
  let inDiagnostics = false;
  let currentFailureName = "";
  const diagnosticLines: string[] = [];

  const flushFailure = () => {
    if (currentFailureName) {
      const detail = diagnosticLines.filter((line) => line.trim().length > 0).slice(0, 8).join(" ");
      state.failures.push(detail ? `${currentFailureName}：${detail}` : currentFailureName);
    }
    currentFailureName = "";
    diagnosticLines.length = 0;
    inDiagnostics = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "").trimEnd();
    if (inDiagnostics) {
      if (/^\s*\.\.\.\s*$/.test(line)) {
        flushFailure();
        continue;
      }
      diagnosticLines.push(line.trim());
      continue;
    }
    if (/^\s*\.\.\.\s*$/.test(line)) {
      flushFailure();
      continue;
    }
    const notOk = line.match(/^not ok (\d+)(?: - (.*))?$/);
    if (notOk) {
      flushFailure();
      state.counts.tests += 1;
      state.counts.fail += 1;
      currentFailureName = (notOk[2] ?? `断言 ${notOk[1]}`).trim();
      continue;
    }
    const ok = line.match(/^ok (\d+)(?: - (.*))?$/);
    if (ok) {
      flushFailure();
      state.counts.tests += 1;
      if (line.includes("# SKIP")) state.counts.skipped += 1;
      else state.counts.pass += 1;
      continue;
    }
    const duration = line.match(/^# duration_ms ([0-9.]+)/);
    if (duration) {
      state.durationMs = Math.round(Number(duration[1]));
      continue;
    }
    const countLine = line.match(/^# (tests|pass|fail|skipped) (\d+)/);
    if (countLine) {
      const key = countLine[1] as keyof TapState["counts"];
      if (key in state.counts) state.counts[key] = Number(countLine[2]);
      continue;
    }
    if (/^\s*---\s*$/.test(line)) {
      inDiagnostics = true;
      continue;
    }
    // “# Subtest: <path>” 只是目录模式下的分组标题，不计数。
  }
  flushFailure();

  const counts = state.counts;
  const passed = counts.fail === 0 && counts.tests > 0;
  const message =
    counts.tests === 0
      ? tail(stdout || stderr) || "未发现测试断言（node:test 无输出）"
      : passed
        ? summarize(counts, state.durationMs)
        : `${summarize(counts, state.durationMs)}\n${state.failures.join("\n") || tail(stderr)}`;
  return {
    passed,
    durationMs: state.durationMs || fallbackDurationMs,
    message,
    counts,
    failures: state.failures,
  };
}

// ---------------------------------------------------------------------------
// vitest / jest（文本 reporter）
// ---------------------------------------------------------------------------

interface ChecklistState {
  counts: { tests: number; pass: number; fail: number; skipped: number };
  failures: string[];
  durationMs: number;
}

function newChecklistState(): ChecklistState {
  return { counts: { tests: 0, pass: 0, fail: 0, skipped: 0 }, failures: [], durationMs: 0 };
}

function parseChecklistOutput(
  stdout: string,
  stderr: string,
  fallbackDurationMs: number,
  options: { passMark: RegExp; failMark: RegExp; summary: RegExp; failureHeader: RegExp },
): NormalizedTestResult {
  const state = newChecklistState();
  const lines = `${stdout}\n${stderr}`.split("\n");
  let inFailureBlock = false;
  let currentFailure = "";
  const failureLines: string[] = [];

  const flushFailure = () => {
    if (currentFailure) {
      state.failures.push(failureLines.length > 0 ? `${currentFailure}：${failureLines.join(" ").slice(0, 500)}` : currentFailure);
    }
    currentFailure = "";
    failureLines.length = 0;
    inFailureBlock = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "").trimEnd();
    if (inFailureBlock) {
      if (options.failureHeader.test(line)) {
        flushFailure();
      } else if (/^\s*⎯+/.test(line) || /^\s*─+/.test(line) || line.startsWith("Test Files") || line.startsWith("Tests ")) {
        flushFailure();
        // 摘要行继续走常规解析
      } else if (line.trim().length > 0 && !/^at /.test(line.trim())) {
        failureLines.push(line.trim());
        continue;
      }
    }
    const fail = line.match(options.failMark);
    if (fail) {
      state.counts.tests += 1;
      state.counts.fail += 1;
      currentFailure = (fail[1] ?? fail[0]).trim();
      inFailureBlock = true;
      continue;
    }
    const pass = line.match(options.passMark);
    if (pass) {
      state.counts.tests += 1;
      state.counts.pass += 1;
      continue;
    }
    if (line.includes("skipped") && /\b(skip|skipped|todo)\b/i.test(line)) {
      state.counts.skipped += 1;
    }
    const summary = line.match(options.summary);
    if (summary) {
      const counts = summary.slice(1).map((value) => Number(value) || 0);
      if (counts.length >= 3) {
        state.counts.tests = counts[0];
        state.counts.pass = counts[1];
        state.counts.fail = counts[2];
      }
    }
    const duration = line.match(/(\d+(?:\.\d+)?)\s*(?:ms|s)/);
    if (duration && !state.durationMs) {
      state.durationMs = Math.round(Number(duration[1]));
    }
  }
  flushFailure();

  const counts = state.counts;
  const passed = counts.fail === 0 && counts.tests > 0;
  const message =
    counts.tests === 0
      ? tail(stdout || stderr) || "未识别到测试断言输出"
      : passed
        ? summarize(counts, state.durationMs)
        : `${summarize(counts, state.durationMs)}\n${state.failures.join("\n") || tail(stderr)}`;
  return {
    passed,
    durationMs: state.durationMs || fallbackDurationMs,
    message,
    counts,
    failures: state.failures,
  };
}

/** vitest 文本 reporter（默认无颜色输出）。 */
export function parseVitestOutput(stdout: string, stderr: string, fallbackDurationMs = 0): NormalizedTestResult {
  return parseChecklistOutput(stdout, stderr, fallbackDurationMs, {
    passMark: /^\s*(?:✓|√|✔|PASS)\s+(.+)$/,
    failMark: /^\s*(?:✗|×|✘|✖|FAIL)\s+(.+)$/,
    summary: /Tests\s+(\d+)\s+(?:passed|passed|failed)\s*\|\s*(\d+)\s+failed\s*\|\s*(\d+)\s+skipped/,
    failureHeader: /^\s*(?:⎯|─){2,}/,
  });
}

/** jest 文本 reporter。 */
export function parseJestOutput(stdout: string, stderr: string, fallbackDurationMs = 0): NormalizedTestResult {
  return parseChecklistOutput(stdout, stderr, fallbackDurationMs, {
    passMark: /^\s*✓\s+(.+)$/,
    failMark: /^\s*✕\s+(.+)$/,
    summary: /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/,
    failureHeader: /^\s*●/,
  });
}

// ---------------------------------------------------------------------------
// static-check：node 脚本以退出码 0/非 0 表达通过/失败，stdout 为说明。
// ---------------------------------------------------------------------------

export function parseStaticCheckOutput(stdout: string, stderr: string, exitCode: number | null, durationMs: number): NormalizedTestResult {
  const passed = exitCode === 0;
  const detail = (stdout || stderr || "").trim();
  const message = passed
    ? (detail || "静态检查通过")
    : (detail || "静态检查失败");
  return {
    passed,
    durationMs,
    message,
    counts: { tests: 1, pass: passed ? 1 : 0, fail: passed ? 0 : 1, skipped: 0 },
    failures: passed ? [] : [message],
  };
}

/** 按框架分发解析；无法识别时按退出码兜底。 */
export function parseTestOutput(
  framework: TestFramework,
  stdout: string,
  stderr: string,
  exitCode: number | null,
  durationMs: number,
): NormalizedTestResult {
  switch (framework) {
    case "node:test":
      return parseNodeTestOutput(stdout, stderr, durationMs);
    case "vitest":
      return parseVitestOutput(stdout, stderr, durationMs);
    case "jest":
      return parseJestOutput(stdout, stderr, durationMs);
    case "static-check":
      return parseStaticCheckOutput(stdout, stderr, exitCode, durationMs);
    default:
      return exitCode === 0 ? { ...EMPTY_RESULT, passed: true, durationMs, message: "测试通过" } : { ...EMPTY_RESULT, durationMs, message: tail(stderr || stdout) || "测试失败" };
  }
}
