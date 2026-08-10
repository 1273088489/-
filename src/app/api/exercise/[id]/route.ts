import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { courses, exercises, learningRecords, lessons } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import type { ExerciseAnswerType, ExerciseDetail, LearningStatus } from "@/types";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const { id } = await params;
  const exercise = db.select().from(exercises).where(eq(exercises.id, id)).get();
  if (!exercise) {
    return fail("练习不存在", 404);
  }

  const lesson = db.select().from(lessons).where(eq(lessons.id, exercise.lessonId)).get();
  const course = lesson
    ? db.select().from(courses).where(eq(courses.id, lesson.courseId)).get()
    : undefined;
  if (!lesson || !course) {
    return fail("练习上下文不存在", 404);
  }

  const record = db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, user.id),
        eq(learningRecords.contentType, "exercise"),
        eq(learningRecords.contentId, exercise.id),
      ),
    )
    .get();

  const detail = {
    id: exercise.id,
    slug: exercise.slug,
    prompt: exercise.prompt,
    answerType: answerType(exercise.answerType),
    status: learningStatus(record?.status),
    mastery: record?.mastery ?? 0,
    hints: parseStringArray(exercise.hints),
    rubric: parseStringArray(exercise.rubric),
    choices: parseStringArray(exercise.choices),
    courseSlug: course.slug,
    courseTitle: course.title,
    lessonSlug: lesson.slug,
    lessonTitle: lesson.title,
  } satisfies ExerciseDetail;

  return ok(detail);
}

function parseStringArray(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
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
