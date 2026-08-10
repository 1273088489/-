import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { courses, lessons, stageProjects, learningRecords } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import type { CourseDetail, LearningStatus } from "@/types";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const { slug } = await params;
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();
  if (!course) {
    return fail("课程不存在", 404);
  }

  const lessonRows = db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
    .orderBy(asc(lessons.orderIndex))
    .all();
  const projectRows = db
    .select()
    .from(stageProjects)
    .where(eq(stageProjects.courseId, course.id))
    .orderBy(asc(stageProjects.orderIndex))
    .all();
  const records = db.select().from(learningRecords).where(eq(learningRecords.userId, user.id)).all();
  const recordByKey = new Map(records.map((record) => [`${record.contentType}:${record.contentId}`, record]));

  const recordFor = (contentType: "lesson" | "project", contentId: string) =>
    recordByKey.get(`${contentType}:${contentId}`) ??
    recordByKey.get(`${contentType}:${course.id}:${contentId}`);

  const lessonSummaries = lessonRows.map((lesson) => {
    const record = recordFor("lesson", lesson.id);
    return {
      slug: lesson.slug,
      title: lesson.title,
      orderIndex: lesson.orderIndex,
      requiresPass: lesson.requiresPass,
      status: learningStatus(record?.status),
      mastery: record?.mastery ?? 0,
    };
  });
  const projectSummaries = projectRows.map((project) => {
    const record = recordFor("project", project.id);
    return {
      slug: project.slug,
      title: project.title,
      description: project.description,
      orderIndex: project.orderIndex,
      status: learningStatus(record?.status),
      mastery: record?.mastery ?? 0,
    };
  });
  const tracked = [
    ...lessonRows.map((lesson) => recordFor("lesson", lesson.id)),
    ...projectRows.map((project) => recordFor("project", project.id)),
  ];

  const detail = {
    slug: course.slug,
    title: course.title,
    description: course.description,
    orderIndex: course.orderIndex,
    progress:
      tracked.length === 0
        ? 0
        : Math.round((tracked.filter((record) => record?.status === "completed").length / tracked.length) * 100),
    lessons: lessonSummaries,
    projects: projectSummaries,
  } satisfies CourseDetail;

  return ok(detail);
}

function learningStatus(value: string | undefined): LearningStatus {
  if (value === "in_progress" || value === "completed" || value === "needs_review") {
    return value;
  }
  return "not_started";
}
