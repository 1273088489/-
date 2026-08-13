// P2-05 evidence_fact 持久化与查询。
// 隐藏测试等 internal 证据只落库供服务端评分复核；公开投影必须过滤。
import { desc, eq } from "drizzle-orm";
import { appDb } from "@/server/review/service";
import { evidenceFacts } from "@/server/db/schema";
import type { EvidenceFact as EvidenceFactRow } from "@/server/db/schema";
import type { EvidenceFact } from "@/server/ai";
import type { EvidenceFactRecord } from "@/types";

/** evidence_fact 行 → API 投影（不含 internal 字段）。 */
export function evidenceFactRecord(row: EvidenceFactRow): EvidenceFactRecord {
  return {
    id: row.id,
    sourceType: row.sourceType as EvidenceFactRecord["sourceType"],
    label: row.label,
    detail: row.detail,
    ref: row.ref,
    createdAt: row.createdAt,
  };
}

/** 持久化一次评分的全部证据：先清空该 attempt 旧证据，再写入新证据。 */
export function persistEvidenceFacts(input: { attemptId: string; facts: EvidenceFact[] }): EvidenceFactRow[] {
  const { attemptId, facts } = input;
  appDb.delete(evidenceFacts).where(eq(evidenceFacts.attemptId, attemptId)).run();
  if (facts.length === 0) return [];
  const now = new Date().toISOString();
  const inserted = appDb
    .insert(evidenceFacts)
    .values(
      facts.map((fact) => ({
        attemptId,
        sourceType: fact.sourceType,
        label: fact.label,
        detail: fact.detail,
        ref: fact.ref ?? "",
        internal: fact.internal === true,
        createdAt: now,
      })),
    )
    .returning()
    .all();
  return inserted;
}

/** 查询某 attempt 的公开证据（internal 过滤；供 GET/提交响应）。 */
export function listPublicEvidenceFactRecords(attemptId: string): EvidenceFactRecord[] {
  const rows = appDb
    .select()
    .from(evidenceFacts)
    .where(eq(evidenceFacts.attemptId, attemptId))
    .orderBy(desc(evidenceFacts.createdAt), desc(evidenceFacts.label))
    .all();
  return rows.filter((row) => !row.internal).map(evidenceFactRecord);
}
