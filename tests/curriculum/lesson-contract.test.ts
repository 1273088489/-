import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { courses } from "@/server/curriculum/data";

const requiredHeadings = [
  "阶段位置与真实场景",
  "学习目标",
  "前置条件",
  "本阶段交付物",
  "实施步骤",
  "核心概念与取舍",
  "常见错误与诊断",
  "完成检查",
  "复盘与迁移",
];

const hintPrefixes = ["定位：", "概念：", "路径："];
const submissionArtifact = /提交|记录|代码|契约|图|矩阵|Arrange|YAML|Dockerfile|步骤/;
const observableAction = /包含|指出|列出|给出|使用|返回|定义|记录|区分|说明|标出|生成|更新|处理|比较|保持|声明|写出|明确|排除|连接|等待|上报|排序|解释|读取/;

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  const next = markdown.indexOf("\n## ", start + heading.length + 3);
  return markdown.slice(start, next === -1 ? undefined : next);
}

function expectLessonContract(slug: string): void {
  const lesson = courses.flatMap((course) => course.lessons).find((item) => item.slug === slug);
  expect(lesson, `missing lesson ${slug}`).toBeDefined();
  if (!lesson) return;

  const headings = [...lesson.contentMarkdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  expect(headings).toEqual(requiredHeadings);

  const goals = section(lesson.contentMarkdown, "学习目标")
    .split("\n")
    .filter((line) => line.startsWith("- 能够"));
  expect(goals.length).toBeGreaterThanOrEqual(2);
  expect(goals.every((goal) => goal.includes("证据："))).toBe(true);

  const steps = section(lesson.contentMarkdown, "实施步骤").split(/(?=^### 步骤 \d+)/gm).slice(1);
  expect(steps.length).toBeGreaterThanOrEqual(3);
  for (const step of steps) {
    expect(step).toContain("**动作**：");
    expect(step).toContain("**原因**：");
    expect(step).toContain("**产出**：");
    expect(step).toContain("**验证**：");
  }

  const errors = section(lesson.contentMarkdown, "常见错误与诊断").split(/(?=^### 错误 \d+)/gm).slice(1);
  expect(errors.length).toBeGreaterThanOrEqual(2);
  for (const error of errors) {
    expect(error).toContain("**症状**：");
    expect(error).toContain("**原因**：");
    expect(error).toContain("**定位**：");
    expect(error).toContain("**修复**：");
  }

  const reflection = section(lesson.contentMarkdown, "复盘与迁移");
  expect(reflection).toMatch(/设计取舍/);
  expect(reflection).toMatch(/迁移/);

  expect(lesson.terminalSteps.length).toBeGreaterThan(0);
  expect(new Set(lesson.terminalSteps.map((step) => step.id)).size).toBe(lesson.terminalSteps.length);
  expect(lesson.terminalSteps.every((step) => step.durationMinutes > 0 && step.command.trim() !== "")).toBe(true);

  expect(lesson.exercises.length).toBeGreaterThan(0);
  for (const exercise of lesson.exercises) {
    expect(exercise.prompt).toMatch(/提交.*(?:列出|写出|给出|画出|记录|说明|实现|附上|标出|提供|渲染|写入|显示|查询|过滤|忽略|触发|使用|依次|禁止)/);
    expect(exercise.prompt).toMatch(/不要|不得|不要求|至少|必须|只|仅|无法|禁止|被忽略/);
    expect(exercise.hints.length).toBeGreaterThanOrEqual(3);
    expect(exercise.hints.slice(0, 3).map((hint) => hint.slice(0, 3))).toEqual(hintPrefixes);
    expect(exercise.solution.trim()).not.toBe("");
    expect(exercise.rubric.length).toBeGreaterThan(0);
    for (const criterion of exercise.rubric) {
      expect(criterion).toMatch(submissionArtifact);
      expect(criterion).toMatch(observableAction);
      expect(criterion).not.toMatch(/理解|掌握|熟悉|说清|体现权衡|定义组件|组件可复用|能答出/);
    }
  }
}

function exercise(slug: string) {
  const found = courses
    .flatMap((course) => course.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((item) => item.slug === slug);
  expect(found, `missing exercise ${slug}`).toBeDefined();
  return found!;
}

describe("lesson teaching contract", () => {
  it("makes the engineering-start lesson independently completable", () => {
    expectLessonContract("s1-dev-environment");
  });

  it("makes the browser-application lesson independently completable", () => {
    expectLessonContract("s2-vanilla-js");
  });

  it("makes the frontend-engineering lesson independently completable", () => {
    expectLessonContract("s3-react");
  });

  it("makes the API and database lesson independently completable", () => {
    expectLessonContract("s4-node-postgres");
  });

  it("adds an independently completable authentication and authorization lesson", () => {
    expectLessonContract("s4-auth-authorization");
  });

  it("adds an independently completable testing and CI lesson", () => {
    expectLessonContract("s4-testing-ci");
  });

  it("adds an independently completable container deployment lesson", () => {
    expectLessonContract("s4-docker-deployment");
  });

  it("maps reviewed learning goals to required exercise evidence", () => {
    expect(exercise("s1-ex2-path").prompt).toMatch(/错误目录|仓库顶层/);
    expect(exercise("s4-testing-ex1-test-plan").prompt).toContain("合法空结果");
    expect(exercise("s4-testing-ex1-test-plan").prompt).toContain("系统错误");
    expect(exercise("s4-deploy-ex1-dockerfile").prompt).toContain("Compose");
    expect(exercise("s4-deploy-ex1-dockerfile").rubric.join(" ")).toMatch(/服务名.*db/);
  });

  it("keeps Compose validation from expanding real secrets", () => {
    const lesson = courses
      .flatMap((course) => course.lessons)
      .find((item) => item.slug === "s4-docker-deployment");
    expect(lesson).toBeDefined();
    expect(lesson!.contentMarkdown).toContain("docker compose --env-file .env.example config");
    expect(lesson!.contentMarkdown).toContain("不要在加载真实秘密的 shell 中捕获展开配置");
  });

  it("records the verified repository versions and CSRF evidence boundary", () => {
    const sourceAudit = fs.readFileSync(
      path.join(process.cwd(), "docs", "tq-03-primary-sources.md"),
      "utf8",
    );
    expect(sourceAudit).toContain("Node.js 24.18.0");
    expect(sourceAudit).toContain("Next.js 16.3.0");
    expect(sourceAudit).toContain("React 19.2.8");
    expect(sourceAudit).toContain("Drizzle ORM 0.45.2");
    expect(sourceAudit).toContain("Vitest 4.1.10");
    expect(sourceAudit).toContain("TQ-03 未设置独立的 CSRF 练习");
  });
});
