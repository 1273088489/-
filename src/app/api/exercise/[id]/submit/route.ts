import { z } from "zod";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/curriculum/service";
import { exercises, learningRecords } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { matchExplicitEvidence } from "@/server/review/evidence";
import { ok, fail, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

// 客户端将答案声明为 unknown；接受 JSON 标量或结构化选择值，再统一转为可判分文本。
const submitSchema = z.object({
  answer: z.unknown().refine((value) => value !== null && value !== undefined, "答案不能为空"),
});

interface Params {
  params: Promise<{ id: string }>;
}

// 将 JSON 字段安全解析为数组（失败回退为空数组）
function parseJsonArray<T = string>(raw: string): T[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) {
    return fail("未登录", 401);
  }

  const { id } = await params;
  const exercise = db.select().from(exercises).where(eq(exercises.id, id)).get();
  if (!exercise) {
    return fail("练习不存在", 404);
  }

  const parsed = await parseBody(req, submitSchema);
  if ("error" in parsed) return parsed.error;
  const rawAnswer = parsed.data.answer;
  const answer = normalizeAnswer(rawAnswer);
  const rubric = parseJsonArray(exercise.rubric);

  // ------------------------------------------------------------------
  // 判断答案对错
  // 1) choices：对比 canonical 的 correctChoiceIndex 与用户选择；
  // 2) code / text：mock 启发式（参考答案关键词 / 作答长度）。
  // ------------------------------------------------------------------
  let correct = false;
  let keywordHits = 0;
  if (exercise.answerType === "choices") {
    const choices = parseJsonArray(exercise.choices);
    const correctIndex = choiceIndex(exercise.solution, choices);
    const selected = choiceIndex(rawAnswer, choices);
    correct =
      correctIndex !== null &&
      selected !== null &&
      selected === correctIndex &&
      selected >= 0 &&
      selected < choices.length;
  } else {
    // 启发式：参考解法中的关键词是否出现；纯关键词命中不够则看长度
    const keywords = (exercise.solution || "").split(/[\s,，。；;:：（）()“”"'‘’\n]+/).filter((k) => k.length >= 2);
    keywordHits = keywords.filter((k) => answer.includes(k)).length;
    const hitRatio = keywords.length === 0 ? 0 : keywordHits / keywords.length;
    const minLen = answerTypeMinLength(exercise.answerType);
    correct = hitRatio >= 0.5 && answer.trim().length >= minLen;
  }

  // ------------------------------------------------------------------
  // 更新 learning_record（以练习 id 为 contentId，contentType = exercise）
  // 正确 -> completed；错误 -> needs_review，并记录错误历史。
  // ------------------------------------------------------------------
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(learningRecords)
    .where(
      and(
        eq(learningRecords.userId, user.id),
        eq(learningRecords.contentId, exercise.id),
        eq(learningRecords.contentType, "exercise"),
      ),
    )
    .get();

  const status = correct ? "completed" : "needs_review";
  const mastery = correct ? 100 : Math.max(0, (existing?.mastery ?? 0) - 10);
  const errorHistory = existing ? parseJsonArray<Record<string, unknown>>(existing.errorHistory) : [];
  if (!correct) {
    errorHistory.push({ at: now, answer: rawAnswer });
  }

  if (existing) {
    db.update(learningRecords)
      .set({ status, mastery, errorHistory: JSON.stringify(errorHistory), updatedAt: now })
      .where(eq(learningRecords.id, existing.id))
      .run();
  } else {
    db.insert(learningRecords)
      .values({
        userId: user.id,
        contentId: exercise.id,
        contentType: "exercise",
        status,
        mastery,
        errorHistory: JSON.stringify(errorHistory),
        updatedAt: now,
      })
      .run();
  }

  const normalizedAnswer = answer.toLocaleLowerCase();
  const rubricResults = rubric.map((criterion) => {
    const matched = matchExplicitEvidence(normalizedAnswer, criterion);
    const supported = exercise.answerType === "choices" ? correct : matched.supported;
    return {
      criterion,
      evidenceStatus: supported ? "supported" as const : "unsupported" as const,
      evidence: exercise.answerType === "choices" && supported
        ? ["所选答案与标准答案一致"]
        : matched.evidence,
      missingEvidence: supported ? [] : matched.missingEvidence,
      nextStep: supported ? "保留该证据，并补充理由或边界说明。" : "补充能直接支持此标准的显式证据。",
    };
  });

  // 反馈文案不会透露 solution，只报告提交文本对公开 rubric 的支持情况。
  let feedback: string;
  if (correct) {
    feedback = `回答正确！掌握度提升到 ${mastery}。`;
  } else if (exercise.answerType === "choices") {
    feedback = `回答不正确，请再思考正确的选项（必要时返回课时内容）。`;
  } else {
    feedback = `回答还需要打磨。建议对照练习 prompt 与 rubric 再检查一遍（掌握度调整到 ${mastery}）。`;
  }

  return ok({
    correct,
    feedback,
    mastery,
    rubricResults,
  });
}

function choiceIndex(value: unknown, choices: string[]): number | null {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["index", "choiceIndex", "selectedIndex", "option"]) {
      if (key in record) return choiceIndex(record[key], choices);
    }
  }
  const answer = normalizeAnswer(value);
  const exact = choices.findIndex((choice) => choice.trim() === answer.trim());
  return exact >= 0 ? exact : multipleChoiceIndex(answer);
}

function normalizeAnswer(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

// 从多选/单选答案中读取选项索引（支持 "2"、"B"、"2. xxx" 等常见形式）
function multipleChoiceIndex(answer: string): number | null {
  const t = answer.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n === 0 ? 0 : n - 1; // 0 基直接按 0，1 基自动减一
  }
  // 字母：B、B. xxx -> 1（跳过 A=0）
  const letter = /^([A-Da-d])(?:$|[\s.．、])/.exec(t);
  if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
  // 数字 + 正文：取前导数字（例如 "2. 状态提升"）
  const m = /^(\d+)[\.．、]/.exec(t);
  if (m) {
    const n = Number(m[1]);
    return n === 0 ? 0 : n - 1;
  }
  return null;
}

// 不同类型答案的最短长度门槛：code 需更完整，text 可稍短
function answerTypeMinLength(type: string): number {
  if (type === "code") return 30;
  return 8;
}
