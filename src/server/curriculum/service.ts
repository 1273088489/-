import { sqlite } from "@/server/db/client";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import { courses, lessons, exercises, stageProjects } from "@/server/db/schema";
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
      const vals = {
        courseId, slug: p.slug, title: p.title, description: p.description,
        orderIndex: p.orderIndex, tasks: JSON.stringify(p.tasks), acceptanceCriteria: JSON.stringify(p.acceptanceCriteria),
        guideMarkdown: p.guideMarkdown, deliverables: JSON.stringify(p.deliverables),
        rubric: JSON.stringify(p.rubric), reflectionQuestions: JSON.stringify(p.reflectionQuestions),
      };
      if (existing) {
        await db.update(stageProjects).set(vals).where(eq(stageProjects.slug, p.slug)).run();
      } else {
        await db.insert(stageProjects).values(vals).run();
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
