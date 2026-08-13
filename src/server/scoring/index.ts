// P2-05 证据化 AI 评分 —— 公共出口。
// 输入：RepoSnapshot + test_runs（公开+隐藏）+ rubric + acceptanceCriteria + 需求
// 输出：score / rubricResults / acceptanceResults / evidenceFacts / capabilityNote（真实执行范围）。
export { aggregateEvidenceScore, buildAggregateReview } from "./aggregator";
export type { AggregateEvidenceInput, AggregateEvidenceOutput } from "./aggregator";
export {
  buildEvidenceFacts,
  buildGitDiffFacts,
  buildTestOutputFacts,
  buildRuntimeFacts,
  buildFileContentFacts,
  publicEvidenceFacts,
  collectFileContentFacts,
  fileFactsToContents,
  MAX_EVIDENCE_FACTS,
} from "./evidence";
export {
  buildEvidenceReviewInput,
  repoSnapshotToEvidence,
  testRunsToEvidence,
  sandboxRunToEvidence,
} from "./ai-review-builder";
export { persistEvidenceFacts, listPublicEvidenceFactRecords, evidenceFactRecord } from "./evidence-store";

import type { ProjectReviewContext } from "@/server/ai";
import type { RepoSnapshot } from "@/server/repo";
import type { IngestSource } from "@/server/repo/ingest";
import type { SandboxRun, TestCase, TestRun } from "@/server/db/schema";
import { getAiProvider } from "@/server/ai";
import type { EvidenceFact, ReviewResult } from "@/server/ai";
import { aggregateEvidenceScore } from "./aggregator";
import {
  buildEvidenceReviewInput,
  repoSnapshotToEvidence,
  sandboxRunToEvidence,
  testRunsToEvidence,
} from "./ai-review-builder";
import { collectFileContentFacts, fileFactsToContents } from "./evidence";
import { persistEvidenceFacts } from "./evidence-store";

export interface RunEvidenceScoringOptions {
  /** 项目教学契约（rubric + acceptanceCriteria + 需求描述）。 */
  project: ProjectReviewContext;
  /** P2-02 仓库解析快照。 */
  snapshot: RepoSnapshot;
  /** P2-04 测试运行行（含隐藏，仅服务端）。 */
  testRuns: Array<{ run: TestRun; testCase: TestCase }>;
  /** P2-03 主沙箱运行行（kind=main）。 */
  mainRun: SandboxRun | null;
  /** 仓库源（用于重新物化读取文件内容证据；skipFileContent 时可省略）。 */
  source?: IngestSource;
  attemptId: string;
  /** 可选：跳过文件内容采集（测试/降级用）。 */
  skipFileContent?: boolean;
}

export interface RunEvidenceScoringResult {
  review: ReviewResult;
  /** 已持久化的全部证据（含 internal）。 */
  evidenceFacts: EvidenceFact[];
}

/**
 * 完整证据化评分管线：
 * 1. 采集 file_content 证据（受限读取，不执行）；
 * 2. 构建确定性证据评分骨架（aggregator）；
 * 3. 调用 AI provider（mock/openai）基于证据评审；
 * 4. 合并安全兜底（score/rubric/acceptance/capabilityNote 恒有值）；
 * 5. 持久化 evidence_fact（含 internal 隐藏证据）。
 * AI 失败时抛错（调用方按 provider 错误约定处理），绝不伪造评分。
 */
export async function runEvidenceScoring(options: RunEvidenceScoringOptions): Promise<RunEvidenceScoringResult> {
  const { project, snapshot, testRuns, mainRun, source, attemptId } = options;

  let fileFacts: EvidenceFact[] = [];
  if (!options.skipFileContent && options.source) {
    fileFacts = await collectFileContentFacts(options.source);
  }
  const fileContents = fileFactsToContents(fileFacts);

  const repository = repoSnapshotToEvidence(snapshot);
  const testRunsEvidence = testRunsToEvidence(testRuns);
  const runtime = sandboxRunToEvidence(mainRun);

  const deterministic = aggregateEvidenceScore({ project, repository, testRuns: testRunsEvidence, runtime, fileContents });

  const provider = getAiProvider();
  const aiReview = await provider.review(
    buildEvidenceReviewInput({ project, repository, testRuns: testRunsEvidence, runtime, fileContents }),
  );

  // 证据事实以确定性采集结果为准（internal 标记正确、绝不包含臆造内容）；
  // AI 只影响 score/rubric/acceptance/capabilityNote，不允许 AI 注入未采集的证据。
  const review: ReviewResult = {
    ...aiReview,
    score: Math.max(0, Math.min(100, Math.round(aiReview.score))),
    rubricResults: aiReview.rubricResults && aiReview.rubricResults.length > 0 ? aiReview.rubricResults : deterministic.rubricResults,
    acceptanceResults: aiReview.acceptanceResults && aiReview.acceptanceResults.length > 0 ? aiReview.acceptanceResults : deterministic.acceptanceResults,
    capabilityNote: aiReview.capabilityNote?.trim() ? aiReview.capabilityNote : deterministic.capabilityNote,
    evidenceFacts: deterministic.evidenceFacts,
  };

  const persisted = persistEvidenceFacts({ attemptId, facts: deterministic.evidenceFacts });
  return { review, evidenceFacts: persisted.map((row) => ({
    sourceType: row.sourceType as EvidenceFact["sourceType"],
    label: row.label,
    detail: row.detail,
    ref: row.ref || undefined,
    internal: row.internal === true,
  })) };
}
