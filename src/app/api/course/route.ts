import { NextRequest } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { courses, lessons, stageProjects, learningRecords } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import type { CourseSummary } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const courseList = db.select().from(courses).orderBy(asc(courses.orderIndex)).all();
  if (courseList.length === 0) {
    return ok([] satisfies CourseSummary[]);
  }

  const courseIds = courseList.map((course) => course.id);
  const lessonRows = db.select().from(lessons).where(inArray(lessons.courseId, courseIds)).all();
  const projectRows = db.select().from(stageProjects).where(inArray(stageProjects.courseId, courseIds)).all();
  const records = db.select().from(learningRecords).where(eq(learningRecords.userId, user.id)).all();
  const recordByKey = new Map(records.map((record) => [`${record.contentType}:${record.contentId}`, record]));

  const summaries = courseList.map((course) => {
    const courseLessons = lessonRows.filter((lesson) => lesson.courseId === course.id);
    const courseProjects = projectRows.filter((project) => project.courseId === course.id);
    const trackedItems = [
      ...courseLessons.map((lesson) => ({ type: "lesson", id: lesson.id })),
      ...courseProjects.map((project) => ({ type: "project", id: project.id })),
    ];
    const completed = trackedItems.filter(({ type, id }) => {
      const record =
        recordByKey.get(`${type}:${id}`) ?? recordByKey.get(`${type}:${course.id}:${id}`);
      return record?.status === "completed";
    }).length;

    return {
      slug: course.slug,
      title: course.title,
      description: course.description,
      progress: trackedItems.length === 0 ? 0 : Math.round((completed / trackedItems.length) * 100),
      lessonCount: courseLessons.length,
      projectCount: courseProjects.length,
    } satisfies CourseSummary;
  });

  return ok(summaries);
}
