import fs from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return fs.readFileSync(path, "utf8"); }

describe("TQ-05 teaching standards UI", () => {
  it("shows explicit course and lesson load errors without stale demo curriculum", () => {
    const coursePage = source("src/app/course/[slug]/page.tsx");
    const lessonPage = source("src/app/lesson/[slug]/page.tsx");

    expect(coursePage).not.toMatch(/demoCourseFallback|usingDemo/);
    expect(lessonPage).not.toMatch(/demoLesson|usingDemo|本地模拟完成/);
    expect(coursePage).toMatch(/ErrorView/);
    expect(lessonPage).toMatch(/ErrorView/);
  });

  it("shows dashboard progress failures without fabricated demo progress", () => {
    const dashboardPage = source("src/app/dashboard/page.tsx");

    expect(dashboardPage).not.toMatch(/demoCourseFallback|usingDemo/);
    expect(dashboardPage).toMatch(/catch[\s\S]*setProgress\(null\)/);
    expect(dashboardPage).toMatch(/error[\s\S]*ErrorView/);
  });

  it("shows the complete project contract before submission without demo fallback", () => {
    const page = source("src/app/project/[slug]/page.tsx");
    expect(page).toMatch(/项目指南/);
    expect(page).toMatch(/交付物/);
    expect(page).toMatch(/评分 Rubric/);
    expect(page).toMatch(/优秀.*胜任.*发展中.*缺失/s);
    expect(page).toMatch(/复盘问题/);
    expect(page).not.toMatch(/demoProject|mockReviewForProject|usingDemo/);
  });

  it("shows exercise rubric and formative limits before submission without demo fallback", () => {
    const page = source("src/app/exercise/[id]/page.tsx");
    expect(page).toMatch(/提交前标准/);
    expect(page).toMatch(/形成性启发式/);
    expect(page).toMatch(/未运行代码.*隐藏测试/s);
    expect(page).toMatch(/已有证据.*缺失证据.*下一步/s);
    expect(page).not.toMatch(/demoExercise|gradeDemoExercise|usingDemo/);
  });

  it("offers copy controls for guide code blocks", () => {
    expect(source("src/components/Markdown.tsx")).toMatch(/navigator\.clipboard\.writeText/);
  });
});
