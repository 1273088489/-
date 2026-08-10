import { z } from "zod";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { lessons, learningRecords } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { ok, fail, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

// 标记课时完成的参数校验：掌握度 0-100
const completeSchema = z.object({
  mastery: z.number().int().min(0).max(100).default(0),
});

interface Params {
  params: Promise<{ slug: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const { slug } = await params;
  const lesson = db.select().from(lessons).where(eq(lessons.slug, slug)).get();
  if (!lesson) {
    return fail("课时不存在", 404);
  }

  const parsed = await parseBody(req, completeSchema);
  if ("error" in parsed) return parsed.error;
  const { mastery } = parsed.data;

  // learning_record 统一保存实体主键；兼容迁移早期的 courseId:lessonId 记录。
  const contentId = lesson.id;
  const legacyContentId = `${lesson.courseId}:${lesson.id}`;
  const now = new Date().toISOString();

  const current = db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, user.id),
        eq(learningRecords.contentId, contentId),
        eq(learningRecords.contentType, "lesson"),
      ),
    )
    .get();
  const legacy = current
    ? undefined
    : db
        .select()
        .from(learningRecords)
        .where(
          and(
            eq(learningRecords.userId, user.id),
            eq(learningRecords.contentId, legacyContentId),
            eq(learningRecords.contentType, "lesson"),
          ),
        )
        .get();
  const existing = current ?? legacy;

  if (existing) {
    // upsert：更新掌握度与状态（completed 表示已学完）
    db.update(learningRecords)
      .set({ contentId, status: "completed", mastery, updatedAt: now })
      .where(eq(learningRecords.id, existing.id))
      .run();
  } else {
    db.insert(learningRecords)
      .values({
        userId: user.id,
        contentId,
        contentType: "lesson",
        status: "completed",
        mastery,
        errorHistory: "[]",
        updatedAt: now,
      })
      .run();
  }

  return ok({ ok: true as const });
}
