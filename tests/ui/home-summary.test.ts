import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoCourseFallback } from "@/lib/demoData";
import { courses } from "@/server/curriculum/data";

describe("public course summary", () => {
  it("keeps the unauthenticated summary aligned with the canonical curriculum", () => {
    const summary = demoCourseFallback();
    const firstLesson = courses[0].lessons[0];

    expect(summary).toMatchObject({
      overallMastery: 0,
      completedLessons: 0,
      totalLessons: 7,
      completedProjects: 0,
      totalProjects: 4,
      completedExercises: 0,
      totalExercises: 15,
      statusCounts: { not_started: 26, in_progress: 0, completed: 0, needs_review: 0 },
      nextLesson: {
        slug: firstLesson.slug,
        title: firstLesson.title,
      },
      courses: [{ slug: "fullstack-ticket-system", progress: 0 }],
    });
  });

  it("keeps demo data summary-only without a second curriculum source", () => {
    const demoData = fs.readFileSync(path.join(process.cwd(), "src", "lib", "demoData.ts"), "utf8");
    const demoLessonPath = path.join(process.cwd(), "src", "lib", "demoLesson.ts");

    expect(fs.existsSync(demoLessonPath)).toBe(false);
    expect(demoData).not.toMatch(/demoExercises|demoExerciseCatalog|demoExercise\(|gradeDemoExercise|demoExerciseSummaries/);
  });

  it("publishes the canonical exercise count and formative-review boundary", () => {
    const homePage = fs.readFileSync(path.join(process.cwd(), "src", "app", "page.tsx"), "utf8");
    const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(homePage).toContain('{ k: "15", v: "道练习题" }');
    expect(homePage).not.toContain('{ k: "9+", v: "道练习题" }');
    expect(readme).toMatch(/形成性.*没有隐藏测试/);
    expect(readme).not.toContain("隐藏测试预置");
  });
});
