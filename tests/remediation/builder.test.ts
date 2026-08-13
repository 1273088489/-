// P2-06 补课路径构建单元测试：排序、去重、限长、兜底与完成判定。
import { describe, expect, it } from "vitest";
import {
  buildRemediationPath,
  buildRuleExplanation,
  evaluateItemCompleted,
  MAX_REMEDIATION_ITEMS,
  REMEDIATION_SCORE_THRESHOLD,
  type CompletionLookup,
  type RemediationSignal,
} from "@/server/remediation";

const LESSONS = [
  { id: "lesson-s1", slug: "s1-dev-environment", title: "第 1 阶段课时：开发环境、终端与 Git" },
  { id: "lesson-s3", slug: "s3-react", title: "第 3 阶段课时：React" },
];
const EXERCISES = [
  { id: "ex-s1-1", slug: "s1-ex1-git-commit", title: "练习：Git 提交" },
  { id: "ex-s1-2", slug: "s1-ex2-path", title: "练习：路径诊断" },
  { id: "ex-s3-1", slug: "s3-ex1-component", title: "练习：组件拆分" },
];
const PROJECTS = [
  { id: "project-p1", slug: "p1-static-page", title: "项目 1：工单系统静态项目说明页" },
];

function signal(partial: Partial<RemediationSignal> & Pick<RemediationSignal, "targets">): RemediationSignal {
  return { kind: "test-failure", ruleId: "test", label: "触发", ...partial };
}

describe("buildRemediationPath", () => {
  it("orders items lesson -> exercise -> project and deduplicates", () => {
    const built = buildRemediationPath({
      project: { id: "project-p1", slug: "p1-static-page", title: "项目 1" },
      score: 55,
      signals: [
        signal({ kind: "error-history", ruleId: "react", targets: [
          { contentType: "lesson", slug: "s3-react", reason: "r1" },
          { contentType: "exercise", slug: "s3-ex1-component", reason: "r2" },
        ] }),
        signal({ targets: [
          { contentType: "project", slug: "p1-static-page", reason: "重新提交" },
          { contentType: "lesson", slug: "s1-dev-environment", reason: "r3" },
          { contentType: "lesson", slug: "s3-react", reason: "重复项" },
        ] }),
      ],
      lessons: LESSONS,
      exercises: EXERCISES,
      projects: PROJECTS,
    });

    expect(built.items.map((item) => item.contentType)).toEqual(["lesson", "lesson", "exercise", "project"]);
    const slugs = built.items.map((item) => item.contentSlug);
    expect(slugs).toEqual(["s3-react", "s1-dev-environment", "s3-ex1-component", "p1-static-page"]);
    // 去重：重复的 s3-react 保留首个理由
    expect(built.items.find((item) => item.contentSlug === "s3-react")!.reason).toBe("r1");
    // 顺序索引连续
    expect(built.items.map((item) => item.orderIndex)).toEqual([0, 1, 2, 3]);
  });

  it("adds a project re-submission item when score is below threshold", () => {
    const built = buildRemediationPath({
      project: { id: "project-p1", slug: "p1-static-page", title: "项目 1" },
      score: 55,
      signals: [],
      lessons: LESSONS,
      exercises: EXERCISES,
      projects: PROJECTS,
    });
    expect(built.items).toHaveLength(1);
    expect(built.items[0]).toMatchObject({ contentType: "project", contentSlug: "p1-static-page" });
    expect(built.items[0].reason).toContain("55");
  });

  it("caps items and always keeps the project re-submission", () => {
    const manyTargets = Array.from({ length: 12 }, (_, index) => ({
      contentType: "exercise" as const,
      slug: index % 2 === 0 ? "s1-ex1-git-commit" : "s1-ex2-path",
      reason: `信号 ${index}`,
    }));
    const built = buildRemediationPath({
      project: { id: "project-p1", slug: "p1-static-page", title: "项目 1" },
      score: 40,
      signals: [signal({ targets: manyTargets })],
      lessons: LESSONS,
      exercises: EXERCISES,
      projects: PROJECTS,
    });
    expect(built.items.length).toBeLessThanOrEqual(MAX_REMEDIATION_ITEMS);
    expect(built.items.at(-1)).toMatchObject({ contentType: "project", contentSlug: "p1-static-page" });
  });

  it("produces a readable rule summary with source counts", () => {
    const built = buildRemediationPath({
      project: { id: "project-p1", slug: "p1-static-page", title: "项目 1" },
      score: 60,
      signals: [
        signal({ kind: "error-history", ruleId: "git-env", targets: [{ contentType: "lesson", slug: "s1-dev-environment", reason: "r" }] }),
        signal({ kind: "rubric-low", ruleId: "rubric-verification", targets: [{ contentType: "project", slug: "p1-static-page", reason: "r" }] }),
      ],
      lessons: LESSONS,
      exercises: EXERCISES,
      projects: PROJECTS,
    });
    expect(built.explanation).toContain("错误记录 1 类");
    expect(built.explanation).toContain("低分维度 1 个");
    expect(built.source).toMatchObject({ score: 60, errorHistoryCount: 1, rubricLowCount: 1, testFailureCount: 0 });
  });
});

describe("buildRuleExplanation", () => {
  it("mentions the pass line and item count", () => {
    const text = buildRuleExplanation({
      projectTitle: "项目 1",
      score: 55,
      counts: { errors: 1, tests: 2, rubrics: 0 },
      itemCount: 4,
    });
    expect(text).toContain("55/100");
    expect(text).toContain("未达到 80 分通过线");
    expect(text).toContain("未通过测试 2 类");
    expect(text).toContain("共 4 步");
  });
});

describe("evaluateItemCompleted", () => {
  const lookup: CompletionLookup = {
    recordFor: (contentId) => {
      if (contentId === "lesson-done") return { status: "completed", mastery: 100 };
      if (contentId === "exercise-done") return { status: "completed", mastery: 100 };
      if (contentId === "exercise-failed") return { status: "needs_review", mastery: 50 };
      if (contentId === "project-passed") return { status: "needs_review", mastery: 85 };
      if (contentId === "project-low") return { status: "needs_review", mastery: 60 };
      return undefined;
    },
  };

  it("treats completed lessons/exercises as done", () => {
    expect(evaluateItemCompleted({ contentType: "lesson", contentId: "lesson-done" }, lookup)).toBe(true);
    expect(evaluateItemCompleted({ contentType: "exercise", contentId: "exercise-done" }, lookup)).toBe(true);
    expect(evaluateItemCompleted({ contentType: "exercise", contentId: "exercise-failed" }, lookup)).toBe(false);
  });

  it("treats projects as done only when mastery reaches the pass line", () => {
    expect(evaluateItemCompleted({ contentType: "project", contentId: "project-passed" }, lookup)).toBe(true);
    expect(evaluateItemCompleted({ contentType: "project", contentId: "project-low" }, lookup)).toBe(false);
    expect(evaluateItemCompleted({ contentType: "project", contentId: "missing" }, lookup)).toBe(false);
  });
});
