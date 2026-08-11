import { describe, expect, it } from "vitest";
import { courses } from "@/server/curriculum/data";

type StageProject = (typeof courses)[number]["projects"][number];

function expectCompleteGuide(project: StageProject) {
  expect(project.guideMarkdown).toMatch(/## 目标/);
  expect(project.guideMarkdown).toMatch(/## 前置条件/);
  expect(project.guideMarkdown).toMatch(/## 项目步骤/);
  expect(project.guideMarkdown).toMatch(/## 常见错误/);

  const stepSection = project.guideMarkdown.match(/## 项目步骤\n([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  const steps = stepSection.match(/^\d+\. .+$/gm) ?? [];
  expect(steps.length).toBeGreaterThanOrEqual(3);
  for (const step of steps) {
    expect(step).toMatch(/原因[\s\S]*产出[\s\S]*验证/);
  }

  const errorSection = project.guideMarkdown.match(/## 常见错误\n([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  const errors = errorSection.match(/^- .+$/gm) ?? [];
  expect(errors.length).toBeGreaterThan(0);
  for (const error of errors) {
    expect(error).toMatch(/症状[\s\S]*原因[\s\S]*定位[\s\S]*修复/);
  }
}

describe("stage project teaching contract", () => {
  it("makes project 1 a ticket-system brief with a copyable PRD and binary evidence", () => {
    const project = courses[0].projects.find((item) => item.slug === "p1-static-page");
    expect(project).toBeDefined();
    expect(project?.title).toContain("工单系统");
    expectCompleteGuide(project!);
    expect(project?.guideMarkdown).toMatch(/最小 PRD 模板/);
    expect(project?.guideMarkdown).toMatch(/最小 PRD 模板[\s\S]*标题[\s\S]*验收标准[\s\S]*(被放弃|替代)方案/);
    expect(project?.deliverables).toEqual(expect.arrayContaining(["最小 PRD 与需求基线"]));
    expect(project?.acceptanceCriteria.every((criterion) => !/清晰|合理|可复用|可用$/.test(criterion))).toBe(true);
    expect(project?.acceptanceCriteria).toEqual(expect.arrayContaining([
      expect.stringMatching(/标题/),
      expect.stringMatching(/README/),
      expect.stringMatching(/提交/),
    ]));
  });

  it("introduces ticket priority in project 2 through impact analysis and local data migration", () => {
    const project = courses[0].projects.find((item) => item.slug === "p2-vanilla-board");
    expect(project).toBeDefined();
    expect(project?.tasks.join("\n")).toMatch(/优先级/);
    expectCompleteGuide(project!);
    expect(project?.guideMarkdown).toMatch(/需求变更任务/);
    expect(project?.guideMarkdown).toMatch(/编码前[\s\S]*影响分析/);
    expect(project?.guideMarkdown).toMatch(/旧 localStorage 数据[\s\S]*迁移/);
    expect(project?.guideMarkdown).toMatch(/需求变更与影响分析模板[\s\S]*变更请求[\s\S]*影响范围[\s\S]*(被放弃|替代)方案[\s\S]*回滚/);
    expect(project?.deliverables).toEqual(expect.arrayContaining([
      "需求变更与编码前影响分析",
      "旧 localStorage 数据迁移验证记录",
    ]));
    expect(project?.acceptanceCriteria.every((criterion) => !/清晰|合理|可复用|可用$/.test(criterion))).toBe(true);
    expect(project?.acceptanceCriteria).toEqual(expect.arrayContaining([
      expect.stringMatching(/high.*medium.*low|高.*中.*低/i),
      expect.stringMatching(/旧 localStorage|旧数据/),
    ]));
    expect(project?.acceptanceCriteria.some((criterion) => /git log.*影响分析.*优先级/.test(criterion))).toBe(true);
  });

  it("migrates ticket priority into React boundaries with an ADR and scaffolded test evidence", () => {
    const project = courses[0].projects.find((item) => item.slug === "p3-react-board");
    expect(project).toBeDefined();
    expect(project?.tasks.join("\n")).toMatch(/优先级/);
    expect(project?.tasks.join("\n")).toMatch(/ADR/);
    expectCompleteGuide(project!);
    expect(project?.guideMarkdown).toMatch(/ADR 模板[\s\S]*状态[\s\S]*决策[\s\S]*被放弃方案[\s\S]*后果/);
    expect(project?.guideMarkdown).toMatch(/脚手架[\s\S]*测试/);
    expect(project?.deliverables).toEqual(expect.arrayContaining([
      "组件边界 ADR",
      "脚手架测试报告",
      "优先级迁移与回归记录",
    ]));
    expect(project?.acceptanceCriteria.every((criterion) => !/清晰|合理|可复用|可用$/.test(criterion))).toBe(true);
    expect(project?.acceptanceCriteria).toEqual(expect.arrayContaining([
      expect.stringMatching(/Task.*priority|priority.*Task/i),
      expect.stringMatching(/脚手架.*测试/),
    ]));
  });

  it("carries ticket priority through the full-stack contract and final evidence set", () => {
    const project = courses[0].projects.find((item) => item.slug === "p4-fullstack-board");
    expect(project).toBeDefined();
    expect(project?.tasks.join("\n")).toMatch(/优先级/);
    expect(project?.tasks.join("\n")).toMatch(/权限/);
    expect(project?.tasks.join("\n")).toMatch(/测试/);
    expect(project?.tasks.join("\n")).toMatch(/部署/);
    expectCompleteGuide(project!);
    expect(project?.guideMarkdown).toMatch(/Mermaid ER 图模板[\s\S]*erDiagram[\s\S]*priority/);
    expect(project?.guideMarkdown).toMatch(/API 契约模板[\s\S]*openapi[\s\S]*priority/);
    expect(project?.deliverables).toEqual(expect.arrayContaining([
      "PRD 定稿与优先级影响分析",
      "Mermaid ER 图",
      "OpenAPI 风格 API 契约",
      "架构决策记录 ADR",
      "测试报告",
      "部署与回滚记录",
    ]));
    expect(project?.acceptanceCriteria.every((criterion) => !/清晰|合理|可复用|可用$/.test(criterion))).toBe(true);
    expect(project?.acceptanceCriteria).toEqual(expect.arrayContaining([
      expect.stringMatching(/数据库.*priority|priority.*数据库/i),
      expect.stringMatching(/API.*priority|priority.*API/i),
      expect.stringMatching(/无权|403/),
      expect.stringMatching(/部署.*SHA|SHA.*部署/),
    ]));
  });

  it("defines structured evidence, scoring, and reflection for every project", () => {
    const projects = courses.flatMap((course) => course.projects);

    expect(projects).toHaveLength(4);
    for (const project of projects) {
      expect(project.guideMarkdown.trim()).not.toBe("");
      expect(project.deliverables.length).toBeGreaterThan(0);
      expect(project.rubric.length).toBeGreaterThanOrEqual(3);
      expect(project.reflectionQuestions.length).toBeGreaterThanOrEqual(2);

      const criterionIds = project.rubric.map((criterion) => criterion.id);
      expect(new Set(criterionIds).size).toBe(criterionIds.length);
      expect(project.rubric.reduce((total, criterion) => total + criterion.weight, 0)).toBe(100);

      for (const criterion of project.rubric) {
        expect(Number.isInteger(criterion.weight) && criterion.weight > 0).toBe(true);
        expect(criterion.criterion.trim()).not.toBe("");
        expect(criterion.evidence.length).toBeGreaterThan(0);
        expect(Object.values(criterion.levels).every((level) => level.trim() !== "")).toBe(true);
        expect(
          Object.values(criterion.levels).every((level) =>
            criterion.evidence.some((evidence) => level.includes(evidence)),
          ),
        ).toBe(true);
      }

      expect(project.reflectionQuestions.some((question) => /设计决策.*放弃|放弃.*方案/.test(question))).toBe(true);
      expect(project.reflectionQuestions.some((question) => /迁移|失败/.test(question))).toBe(true);
    }
  });
});
