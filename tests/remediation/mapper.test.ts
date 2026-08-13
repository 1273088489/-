// P2-06 规则引擎映射单元测试：错误历史 / 测试失败分类 / rubric 低分维度 → 学习内容。
import { describe, expect, it } from "vitest";
import {
  classifyErrorHistory,
  classifyRubricLowScores,
  classifyTestFailures,
  mapSignalsToTargets,
} from "@/server/remediation";

describe("classifyErrorHistory", () => {
  it("maps git/env errors to the development-environment lesson and exercises", () => {
    const signals = classifyErrorHistory([
      { at: "2026-08-12T00:00:00Z", answer: "git commit 时报错：command not found，路径不对" },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "error-history", ruleId: "git-env" });
    const slugs = signals[0].targets.map((target) => target.slug);
    expect(slugs).toContain("s1-dev-environment");
    expect(slugs).toContain("s1-ex1-git-commit");
    expect(slugs).toContain("s1-ex2-path");
  });

  it("maps security-sensitive entries to the auth lesson before generic auth rules", () => {
    const signals = classifyErrorHistory([{ answer: "password 硬编码在代码里" }]);
    expect(signals[0].ruleId).toBe("security");
    expect(signals[0].targets.some((target) => target.slug === "s4-auth-authorization")).toBe(true);
  });

  it("maps React state errors to the React lesson", () => {
    const signals = classifyErrorHistory([{ answer: "useState 更新后组件不渲染" }]);
    expect(signals[0].ruleId).toBe("react");
    expect(signals[0].targets.some((target) => target.slug === "s3-react")).toBe(true);
  });

  it("deduplicates rules across entries and ignores unmapped noise", () => {
    const signals = classifyErrorHistory([
      { answer: "git 命令找不到" },
      { answer: "PATH 环境变量不对" },
      { answer: "今天天气不错" },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0].ruleId).toBe("git-env");
  });
});

describe("classifyTestFailures", () => {
  it("maps a failed public test to stage lesson, exercises and project re-submission", () => {
    const signals = classifyTestFailures(
      [
        { key: "p1-public-page-content", name: "说明页包含名称、目标用户与项目链接", kind: "public", passed: false, status: "failed" },
      ],
      "p1-static-page",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "test-failure", ruleId: "test-public-p1-public-page-content" });
    expect(signals[0].label).toContain("说明页包含名称");
    const slugs = signals[0].targets.map((target) => target.slug);
    expect(slugs).toContain("s1-dev-environment");
    expect(slugs).toContain("p1-static-page");
    const projectTarget = signals[0].targets.find((target) => target.contentType === "project")!;
    expect(projectTarget.reason).toContain("重新提交");
  });

  it("never exposes hidden test names or keys in reasons", () => {
    const signals = classifyTestFailures(
      [
        { key: "p1-hidden-baseline-docs", name: "README 与最小 PRD 基线完整", kind: "hidden", passed: false, status: "failed" },
      ],
      "p1-static-page",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].ruleId).toBe("test-hidden");
    const serialized = JSON.stringify(signals);
    expect(serialized).not.toContain("p1-hidden-baseline-docs");
    expect(serialized).not.toContain("README 与最小 PRD");
    expect(signals[0].targets.some((target) => target.slug === "p1-static-page")).toBe(true);
  });

  it("ignores passed tests", () => {
    const signals = classifyTestFailures(
      [
        { key: "p1-public-page-content", name: "说明页内容", kind: "public", passed: true, status: "passed" },
      ],
      "p1-static-page",
    );
    expect(signals).toHaveLength(0);
  });
});

describe("classifyRubricLowScores", () => {
  it("maps verification low score to testing lesson/exercise and project re-submission", () => {
    const signals = classifyRubricLowScores(
      [{ criterionId: "verification", criterion: "验收结论有可审查证据", level: "missing", score: 0, weight: 35 }],
      "p4-fullstack-board",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].ruleId).toBe("rubric-verification");
    const slugs = signals[0].targets.map((target) => target.slug);
    expect(slugs).toContain("s4-testing-ci");
    expect(slugs).toContain("s4-testing-ex1-test-plan");
    expect(slugs).toContain("p4-fullstack-board");
  });

  it("maps implementation low score to the project stage lesson", () => {
    const signals = classifyRubricLowScores(
      [{ criterionId: "implementation", criterion: "实现与项目任务一致", level: "developing", score: 20, weight: 40 }],
      "p3-react-board",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].targets.some((target) => target.contentType === "lesson" && target.slug === "s3-react")).toBe(true);
  });

  it("ignores competent/excellent dimensions", () => {
    const signals = classifyRubricLowScores(
      [{ criterionId: "verification", criterion: "验收结论有可审查证据", level: "competent", score: 70, weight: 35 }],
      "p1-static-page",
    );
    expect(signals).toHaveLength(0);
  });
});

describe("mapSignalsToTargets", () => {
  it("combines all three signal sources", () => {
    const signals = mapSignalsToTargets({
      errorHistory: [{ answer: "React 组件 state 更新失败" }],
      testRuns: [
        { key: "p1-public-page-content", name: "说明页内容", kind: "public", passed: false, status: "failed" },
      ],
      rubricResults: [
        { criterionId: "decision-record", criterion: "设计决策及取舍有记录", level: "missing", score: 0, weight: 25 },
      ],
      projectSlug: "p1-static-page",
    });
    const kinds = signals.map((signal) => signal.kind).sort();
    expect(kinds).toEqual(["error-history", "rubric-low", "test-failure"]);
  });
});
