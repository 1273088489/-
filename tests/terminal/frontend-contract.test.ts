import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("shared terminal UI contract", () => {
  it("uses the authenticated course URL and fixed terminal frame", () => {
    const component = read("../../src/components/LessonTerminal.tsx");
    expect(component).toContain("/terminal/");
    expect(component).toContain("encodeURIComponent(courseSlug)");
    expect(component).toContain("h-[315px]");
    expect(component).not.toContain("terminalRunning");
    expect(component).not.toContain("copyCommand");
    expect(component).not.toContain("steps:");
  });

  it("uses the same 380px terminal aside on lesson and exercise pages", () => {
    const lesson = read("../../src/app/lesson/[slug]/page.tsx");
    const exercise = read("../../src/app/exercise/[id]/page.tsx");
    expect(lesson).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
    expect(lesson).toContain("<LessonTerminal courseSlug={lesson.courseSlug} />");
    expect(exercise).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
    expect(exercise).toContain("<LessonTerminal courseSlug={exercise.courseSlug} />");
  });
});
