import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { courses, exercises, learningRecords, lessons, stageProjects } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail } from "@/lib/api";
import type { CourseSummary, LearningStatus, ProgressOverview, RecentActivity } from "@/types";

export const dynamic = "force-dynamic";

type ContentType = RecentActivity["contentType"];

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const records = db
    .select()
    .from(learningRecords)
    .where(eq(learningRecords.userId, user.id))
    .orderBy(desc(learningRecords.updatedAt))
    .all();
  const courseList = db.select().from(courses).orderBy(asc(courses.orderIndex)).all();
  const lessonRows = db.select().from(lessons).orderBy(asc(lessons.orderIndex)).all();
  const exerciseRows = db.select().from(exercises).all();
  const projectRows = db.select().from(stageProjects).orderBy(asc(stageProjects.orderIndex)).all();

  const recordByKey = new Map(records.map((record) => [`${record.contentType}:${record.contentId}`, record]));
  const recordFor = (type: ContentType, id: string, courseId?: string) =>
    recordByKey.get(`${type}:${id}`) ??
    (courseId ? recordByKey.get(`${type}:${courseId}:${id}`) : undefined);
  const lessonById = new Map(lessonRows.map((lesson) => [lesson.id, lesson]));
  const exerciseById = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
  const projectById = new Map(projectRows.map((project) => [project.id, project]));

  const allItems = [
    ...lessonRows.map((lesson) => ({ type: "lesson" as const, id: lesson.id, courseId: lesson.courseId })),
    ...exerciseRows.map((exercise) => ({
      type: "exercise" as const,
      id: exercise.id,
      courseId: lessonById.get(exercise.lessonId)?.courseId,
    })),
    ...projectRows.map((project) => ({ type: "project" as const, id: project.id, courseId: project.courseId })),
  ];
  const statusCounts: Record<LearningStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    needs_review: 0,
  };
  for (const item of allItems) {
    statusCounts[learningStatus(recordFor(item.type, item.id, item.courseId)?.status)] += 1;
  }

  const completedByType = (type: ContentType) =>
    allItems.filter(
      (item) =>
        item.type === type && recordFor(item.type, item.id, item.courseId)?.status === "completed",
    ).length;
  const masterySum = allItems.reduce(
    (sum, item) => sum + (recordFor(item.type, item.id, item.courseId)?.mastery ?? 0),
    0,
  );

  const courseSummaries = courseList.map((course) => {
    const courseLessons = lessonRows.filter((lesson) => lesson.courseId === course.id);
    const courseProjects = projectRows.filter((project) => project.courseId === course.id);
    const primaryItems = [
      ...courseLessons.map((lesson) => ({ type: "lesson" as const, id: lesson.id })),
      ...courseProjects.map((project) => ({ type: "project" as const, id: project.id })),
    ];
    const completed = primaryItems.filter(
      (item) => recordFor(item.type, item.id, course.id)?.status === "completed",
    ).length;
    return {
      slug: course.slug,
      title: course.title,
      description: course.description,
      progress: primaryItems.length === 0 ? 0 : Math.round((completed / primaryItems.length) * 100),
      lessonCount: courseLessons.length,
      projectCount: courseProjects.length,
    } satisfies CourseSummary;
  });

  const recentActivities: RecentActivity[] = [];
  const seenActivities = new Set<string>();
  for (const record of records) {
    const resolved = resolveContent(record.contentType, record.contentId, lessonById, exerciseById, projectById);
    if (!resolved) continue;
    const key = `${resolved.type}:${resolved.id}`;
    if (seenActivities.has(key)) continue;
    seenActivities.add(key);
    recentActivities.push({
      id: record.id,
      label: resolved.label,
      contentId: resolved.id,
      contentType: resolved.type,
      status: learningStatus(record.status),
      mastery: record.mastery,
      updatedAt: record.updatedAt,
      url: resolved.url,
    });
    if (recentActivities.length === 20) break;
  }

  const nextLesson = courseList
    .flatMap((course) => lessonRows.filter((lesson) => lesson.courseId === course.id))
    .find((lesson) => recordFor("lesson", lesson.id, lesson.courseId)?.status !== "completed");
  const nextLessonRecord = nextLesson
    ? recordFor("lesson", nextLesson.id, nextLesson.courseId)
    : undefined;

  const overview = {
    overallMastery: allItems.length === 0 ? 0 : Math.round(masterySum / allItems.length),
    completedLessons: completedByType("lesson"),
    totalLessons: lessonRows.length,
    completedProjects: completedByType("project"),
    totalProjects: projectRows.length,
    completedExercises: completedByType("exercise"),
    totalExercises: exerciseRows.length,
    statusCounts,
    courses: courseSummaries,
    recentActivities,
    nextLesson: nextLesson
      ? {
          slug: nextLesson.slug,
          title: nextLesson.title,
          orderIndex: nextLesson.orderIndex,
          requiresPass: nextLesson.requiresPass,
          status: learningStatus(nextLessonRecord?.status),
          mastery: nextLessonRecord?.mastery ?? 0,
          url: `/lesson/${nextLesson.slug}`,
        }
      : null,
  } satisfies ProgressOverview;

  return ok(overview);
}

function resolveContent(
  contentType: string,
  contentId: string,
  lessonById: Map<string, (typeof lessons.$inferSelect)>,
  exerciseById: Map<string, (typeof exercises.$inferSelect)>,
  projectById: Map<string, (typeof stageProjects.$inferSelect)>,
): { type: ContentType; id: string; label: string; url: string } | null {
  const normalizedId = contentId.includes(":") ? contentId.slice(contentId.lastIndexOf(":") + 1) : contentId;
  if (contentType === "lesson") {
    const lesson = lessonById.get(normalizedId);
    return lesson
      ? { type: "lesson", id: lesson.id, label: lesson.title, url: `/lesson/${lesson.slug}` }
      : null;
  }
  if (contentType === "exercise") {
    const exercise = exerciseById.get(normalizedId);
    return exercise
      ? { type: "exercise", id: exercise.id, label: exercise.prompt, url: `/exercise/${exercise.id}` }
      : null;
  }
  if (contentType === "project") {
    const project = projectById.get(normalizedId);
    return project
      ? { type: "project", id: project.id, label: project.title, url: `/project/${project.slug}` }
      : null;
  }
  return null;
}

function learningStatus(value: string | undefined): LearningStatus {
  if (value === "in_progress" || value === "completed" || value === "needs_review") {
    return value;
  }
  return "not_started";
}
