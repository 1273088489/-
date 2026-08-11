import { describe, expect, it } from "vitest";
import { courses } from "@/server/curriculum/data";

describe("global curriculum contract", () => {
  it("keeps the complete course, lesson, exercise, and project inventory", () => {
    const lessons = courses.flatMap((course) => course.lessons);
    const exercises = lessons.flatMap((lesson) => lesson.exercises);
    const projects = courses.flatMap((course) => course.projects);

    expect(courses).toHaveLength(1);
    expect(lessons).toHaveLength(7);
    expect(exercises).toHaveLength(15);
    expect(projects).toHaveLength(4);
  });

  it("uses one globally unique slug namespace", () => {
    const slugs = courses.flatMap((course) => [
      course.slug,
      ...course.lessons.flatMap((lesson) => [
        lesson.slug,
        ...lesson.exercises.map((exercise) => exercise.slug),
      ]),
      ...course.projects.map((project) => project.slug),
    ]);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves every learning-goal evidence reference", () => {
    const lessons = courses.flatMap((course) => course.lessons);
    const exerciseSlugs = new Set(
      lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.slug)),
    );
    const projectNumbers = new Set(
      courses.flatMap((course) => course.projects.map((project) => project.orderIndex + 1)),
    );

    for (const lesson of lessons) {
      const goals = lesson.contentMarkdown
        .match(/## 学习目标\n([\s\S]*?)(?=\n## )/)?.[1]
        .split("\n")
        .filter((line) => line.startsWith("- 能够")) ?? [];

      expect(goals.length, `${lesson.slug} has no learning goals`).toBeGreaterThan(0);
      for (const goal of goals) {
        expect(goal, `${lesson.slug} goal has no evidence`).toContain("证据：");

        const exerciseReferences = [...goal.matchAll(/`([a-z0-9-]+)`/g)]
          .map((match) => match[1])
          .filter((slug) => slug.includes("-ex"));
        const projectReferences = [...goal.matchAll(/阶段项目\s*(\d+)/g)].map((match) =>
          Number(match[1]),
        );

        expect(
          exerciseReferences.length + projectReferences.length,
          `${lesson.slug} goal has no resolvable evidence reference: ${goal}`,
        ).toBeGreaterThan(0);
        for (const slug of exerciseReferences) expect(exerciseSlugs.has(slug)).toBe(true);
        for (const number of projectReferences) expect(projectNumbers.has(number)).toBe(true);
      }
    }
  });
});
