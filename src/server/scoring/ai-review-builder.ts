// P2-05 AI 评审输入构建 —— 把 RepoSnapshot + test_run/test_case + sandbox_run 行
// 转换为 provider 的 ReviewInput.evidence（真实采集证据，不臆造）。
import type {
  ProjectReviewContext,
  ReviewEvidenceFileContent,
  ReviewEvidenceInput,
  ReviewEvidenceRepository,
  ReviewEvidenceRuntime,
  ReviewEvidenceTestRun,
  ReviewInput,
} from "@/server/ai";
import type { RepoSnapshot } from "@/server/repo";
import type { SandboxRun, TestCase, TestRun } from "@/server/db/schema";

/** RepoSnapshot（P2-02）→ provider 可消费的仓库证据投影。 */
export function repoSnapshotToEvidence(snapshot: RepoSnapshot): ReviewEvidenceRepository {
  return {
    sourceType: snapshot.source.type,
    head: snapshot.head
      ? { branch: snapshot.head.branch, shortHash: snapshot.head.shortHash, subject: snapshot.head.subject }
      : null,
    branches: snapshot.branches.map((branch) => ({ name: branch.name, isHead: branch.isHead })),
    commits: snapshot.commits.map((commit) => ({ shortHash: commit.shortHash, subject: commit.subject })),
    diff: {
      baseRef: snapshot.diff.baseRef,
      filesChanged: snapshot.diff.filesChanged,
      insertions: snapshot.diff.insertions,
      deletions: snapshot.diff.deletions,
      files: snapshot.diff.files.map((file) => ({
        path: file.path,
        status: file.status,
        insertions: file.insertions,
        deletions: file.deletions,
      })),
    },
    tree: {
      fileCount: snapshot.tree.fileCount,
      totalBytes: snapshot.tree.totalBytes,
      files: snapshot.tree.files,
    },
  };
}

/** test_run + test_case 行 → provider 可消费的测试证据（含隐藏，仅服务端）。 */
export function testRunsToEvidence(rows: Array<{ run: TestRun; testCase: TestCase }>): ReviewEvidenceTestRun[] {
  return rows.map(({ run, testCase }) => ({
    key: testCase.key,
    name: testCase.name,
    kind: testCase.kind === "hidden" ? "hidden" : "public",
    passed: run.passed,
    status: run.status === "passed" ? "passed" : run.status === "skipped" ? "skipped" : run.status === "error" ? "error" : "failed",
    durationMs: run.durationMs,
    message: run.message,
    framework: testCase.framework,
  }));
}

/** sandbox_run 行（kind=main）→ provider 可消费的运行时证据。 */
export function sandboxRunToEvidence(row: SandboxRun | null | undefined): ReviewEvidenceRuntime | null {
  if (!row) return null;
  const phases = (() => {
    try {
      const parsed = JSON.parse(row.phases);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return {
    status: row.status === "success" ? "success" : "failed",
    errorCode: row.errorCode,
    exitCode: row.exitCode,
    durationMs: row.durationMs,
    timedOut: row.timedOut,
    oomKilled: row.oomKilled,
    message: row.message,
    phases: phases.map((phase: { phase?: string; label?: string; skipped?: boolean; exitCode?: number | null; durationMs?: number; stdout?: string; stderr?: string }) => ({
      phase: String(phase.phase ?? ""),
      label: String(phase.label ?? ""),
      skipped: phase.skipped === true,
      exitCode: phase.exitCode ?? null,
      durationMs: Number(phase.durationMs ?? 0),
      stdout: String(phase.stdout ?? ""),
      stderr: String(phase.stderr ?? ""),
    })),
  };
}

/** 组装仓库提交的证据化 ReviewInput（code 为空，证据在 evidence 字段）。 */
export function buildEvidenceReviewInput(input: {
  project: ProjectReviewContext;
  repository: ReviewEvidenceRepository;
  testRuns: ReviewEvidenceTestRun[];
  runtime: ReviewEvidenceRuntime | null;
  fileContents: ReviewEvidenceFileContent[];
}): ReviewInput {
  const evidence: ReviewEvidenceInput = {
    repository: input.repository,
    testRuns: input.testRuns,
    runtime: input.runtime,
    fileContents: input.fileContents,
  };
  return {
    code: "",
    project: input.project,
    evidence,
  };
}
