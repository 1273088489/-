import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { lessons, exercises, learningRecords, courses } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import type { ExerciseAnswerType, LearningStatus, LessonDetail } from "@/types";

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
  const lesson = db.select().from(lessons).where(eq(lessons.slug, slug)).get();
  if (!lesson) {
    return fail("课时不存在", 404);
  }

  const course = db.select().from(courses).where(eq(courses.id, lesson.courseId)).get();
  if (!course) {
    return fail("课程不存在", 404);
  }

  const courseLessons = db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, lesson.courseId))
    .orderBy(asc(lessons.orderIndex))
    .all();
  const exerciseRows = db
    .select()
    .from(exercises)
    .where(eq(exercises.lessonId, lesson.id))
    .orderBy(asc(exercises.createdAt))
    .all();
  const records = db
    .select()
    .from(learningRecords)
    .where(eq(learningRecords.userId, user.id))
    .all();
  const recordByKey = new Map(records.map((record) => [`${record.contentType}:${record.contentId}`, record]));
  const lessonRecord =
    recordByKey.get(`lesson:${lesson.id}`) ??
    recordByKey.get(`lesson:${lesson.courseId}:${lesson.id}`);
  const lessonIndex = courseLessons.findIndex((item) => item.id === lesson.id);

  const detail = {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    orderIndex: lesson.orderIndex,
    contentMarkdown: lesson.contentMarkdown,
    requiresPass: lesson.requiresPass,
    courseSlug: course.slug,
    courseTitle: course.title,
    status: learningStatus(lessonRecord?.status),
    mastery: lessonRecord?.mastery ?? 0,
    exercises: exerciseRows.map((exercise) => {
      const record = recordByKey.get(`exercise:${exercise.id}`);
      return {
        id: exercise.id,
        slug: exercise.slug,
        prompt: exercise.prompt,
        answerType: answerType(exercise.answerType),
        status: learningStatus(record?.status),
        mastery: record?.mastery ?? 0,
      };
    }),
    prevLessonSlug: lessonIndex > 0 ? courseLessons[lessonIndex - 1]?.slug ?? null : null,
    nextLessonSlug:
      lessonIndex >= 0 && lessonIndex < courseLessons.length - 1
        ? courseLessons[lessonIndex + 1]?.slug ?? null
        : null,
  } satisfies LessonDetail;

  return ok(detail);
}

function answerType(value: string): ExerciseAnswerType {
  return value === "choices" || value === "code" ? value : "text";
}

function learningStatus(value: string | undefined): LearningStatus {
  if (value === "in_progress" || value === "completed" || value === "needs_review") {
    return value;
  }
  return "not_started";
}
