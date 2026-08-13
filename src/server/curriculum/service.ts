import { sqlite } from "@/server/db/client";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import { courses, lessons, exercises, stageProjects, testCases } from "@/server/db/schema";
import type { ProjectTestCaseDef } from "@/server/tests/types";
import { courses as courseDefs } from "@/server/curriculum/data";

export const db = drizzle(sqlite);

export async function seedCurriculum() {
  for (const c of courseDefs) {
    const existingCourse = db.select().from(courses).where(eq(courses.slug, c.slug)).get();
    let courseId: string;
    if (existingCourse) {
      await db.update(courses).set({ title: c.title, description: c.description, orderIndex: c.orderIndex }).where(eq(courses.slug, c.slug)).run();
      courseId = existingCourse.id;
    } else {
      courseId = (await db.insert(courses).values({ slug: c.slug, title: c.title, description: c.description, orderIndex: c.orderIndex }).returning())[0].id;
    }

    for (const l of c.lessons) {
      const existingLesson = db.select().from(lessons).where(and(eq(lessons.courseId, courseId), eq(lessons.slug, l.slug))).get();
      let lessonId: string;
      if (existingLesson) {
        await db.update(lessons).set({ title: l.title, contentMarkdown: l.contentMarkdown, orderIndex: l.orderIndex, requiresPass: l.requiresPass }).where(and(eq(lessons.courseId, courseId), eq(lessons.slug, l.slug))).run();
        lessonId = existingLesson.id;
      } else {
        lessonId = (await db.insert(lessons).values({ courseId, slug: l.slug, title: l.title, contentMarkdown: l.contentMarkdown, orderIndex: l.orderIndex, requiresPass: l.requiresPass }).returning())[0].id;
      }
      for (const ex of l.exercises) {
        const existing = db.select().from(exercises).where(and(eq(exercises.lessonId, lessonId), eq(exercises.slug, ex.slug))).get();
        const vals = {
          lessonId, slug: ex.slug, prompt: ex.prompt,
          hints: JSON.stringify(ex.hints), solution: ex.solution,
          rubric: JSON.stringify(ex.rubric), answerType: ex.answerType,
          choices: JSON.stringify(ex.choices ?? []),
        };
        if (existing) {
          await db.update(exercises).set(vals).where(and(eq(exercises.lessonId, lessonId), eq(exercises.slug, ex.slug))).run();
        } else {
          await db.insert(exercises).values(vals).run();
        }
      }
    }

    for (const p of c.projects) {
      const existing = db.select().from(stageProjects).where(eq(stageProjects.slug, p.slug)).get();
      let projectId: string;
      const vals = {
        courseId, slug: p.slug, title: p.title, description: p.description,
        orderIndex: p.orderIndex, tasks: JSON.stringify(p.tasks), acceptanceCriteria: JSON.stringify(p.acceptanceCriteria),
        guideMarkdown: p.guideMarkdown, deliverables: JSON.stringify(p.deliverables),
        rubric: JSON.stringify(p.rubric), reflectionQuestions: JSON.stringify(p.reflectionQuestions),
        sandboxConfig: JSON.stringify(p.sandbox ?? {}),
      };
      if (existing) {
        await db.update(stageProjects).set(vals).where(eq(stageProjects.slug, p.slug)).run();
        projectId = existing.id;
      } else {
        projectId = (await db.insert(stageProjects).values(vals).returning())[0].id;
      }

      // P2-04：公开/隐藏测试定义（hidden 只落库，绝不进入公开 API/课程数据）。
      const testDefs: Array<ProjectTestCaseDef & { kind: "public" | "hidden" }> = [
        ...(p.publicTests ?? []).map((t) => ({ ...t, kind: "public" as const })),
        ...(p.hiddenTests ?? []).map((t) => ({ ...t, kind: "hidden" as const })),
      ];
      for (const def of testDefs) {
        const existingCase = db
          .select()
          .from(testCases)
          .where(and(eq(testCases.projectId, projectId), eq(testCases.key, def.id)))
          .get();
        const caseVals = {
          projectId,
          key: def.id,
          kind: def.kind,
          name: def.name,
          framework: def.framework,
          files: JSON.stringify(def.files),
          command: JSON.stringify(def.command ?? []),
          orderIndex: def.orderIndex ?? 0,
        };
        if (existingCase) {
          await db.update(testCases).set(caseVals).where(eq(testCases.id, existingCase.id)).run();
        } else {
          await db.insert(testCases).values(caseVals).run();
        }
      }
    }
  }
  return { courses: courseDefs.length };
}

export async function ensureSeeded() {
  const count = db.select().from(courses).all().length;
  if (count === 0) return seedCurriculum();
  return { courses: count };
}
