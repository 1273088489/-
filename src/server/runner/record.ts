// P2-03 sandbox_run 行 → API 投影（与 src/types 的 SandboxRunRecord 契约对齐）。
import type { SandboxRun } from "@/server/db/schema";
import type { SandboxRunRecord } from "@/types";
import { parseJson } from "@/server/ai/json";

/** 把数据库 sandbox_run 行投影为客户端可见记录（phases 为 JSON 列）。 */
export function projectSandboxRunRecord(row: SandboxRun): SandboxRunRecord {
  return {
    id: row.id,
    attemptId: row.attemptId,
    repositorySubmissionId: row.repositorySubmissionId,
    runtime: row.runtime === "static" ? "static" : "node",
    status: row.status === "failed" ? "failed" : "success",
    errorCode: row.errorCode,
    exitCode: row.exitCode,
    stdout: row.stdout,
    stderr: row.stderr,
    phases: parseJson<SandboxRunRecord["phases"]>(row.phases, []),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    timedOut: row.timedOut,
    oomKilled: row.oomKilled,
    message: row.message,
  };
}
