// P2-05 证据聚合器 —— 把真实采集证据（仓库 diff / 测试运行 / 沙箱运行 / 文件内容）
// 聚合为确定性评分骨架（score / rubricResults / acceptanceResults / capabilityNote）。
// Mock provider 直接使用；OpenAI provider 以它为 prompt 上下文与安全兜底。
// 原则：capabilityNote 只声明实际执行/读取的动作，绝不臆造未执行结果。
import type {
  AcceptanceReviewItem,
  EvidenceFact,
  ProjectReviewContext,
  ReviewEvidenceFileContent,
  ReviewEvidenceInput,
  ReviewEvidenceRepository,
  ReviewEvidenceRuntime,
  ReviewEvidenceTestRun,
  ReviewResult,
  RubricLevel,
  RubricReviewItem,
} from "@/server/ai";
import { matchExplicitEvidence } from "@/server/review/evidence";
import { buildEvidenceFacts, publicEvidenceFacts } from "./evidence";

const LEVEL_RATIO: Record<RubricLevel, number> = { excellent: 1, competent: 0.8, developing: 0.5, missing: 0 };

/** 外部验证类声明（URL/部署/线上），无测试证据时只能 unverifiable。 */
const EXTERNAL_CLAIM = new RegExp("测试(?:结果)?(?:已)?通过|git (?:log|history)|提交历史|仓库(?:已)?访问|部署(?:地址)?(?:可打开|可访问|已验证)|(?:url|网址|线上地址|发布地址)|https?://", "i");

export interface AggregateEvidenceInput {
  project: ProjectReviewContext;
  repository?: ReviewEvidenceRepository;
  testRuns?: ReviewEvidenceTestRun[];
  runtime?: ReviewEvidenceRuntime | null;
  fileContents?: ReviewEvidenceFileContent[];
}

export interface AggregateEvidenceOutput {
  score: number;
  rubricResults: RubricReviewItem[];
  acceptanceResults: AcceptanceReviewItem[];
  capabilityNote: string;
  /** 评分引用的全部证据（含 internal）。 */
  evidenceFacts: EvidenceFact[];
}

/** 把文件内容拼接为可匹配文本（小写），用于证据术语命中。 */
function buildFileText(fileContents: ReviewEvidenceFileContent[] | undefined): string {
  return (fileContents ?? []).map((file) => `文件 ${file.path}：\n${file.content}`).join("\n").toLocaleLowerCase();
}

/** 把公开测试名称/消息拼接为可匹配文本（隐藏测试名称绝不进入证据字符串）。 */
function buildTestText(testRuns: ReviewEvidenceTestRun[] | undefined): string {
  return (testRuns ?? [])
    .filter((run) => run.kind === "public")
    .map((run) => `公开测试 ${run.name}：${run.message}`)
    .join("\n")
    .toLocaleLowerCase();
}

/** 把仓库 diff 路径拼接为可匹配文本。 */
function buildDiffText(repository: ReviewEvidenceRepository | undefined): string {
  return (repository?.diff.files ?? []).map((file) => file.path).join("\n").toLocaleLowerCase();
}

function splitTerms(criterion: string): string[] {
  return [...new Set(
    criterion
      .split(/[，。；：、\s`'"()（）]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  )];
}

function levelForRatio(ratio: number): RubricLevel {
  return ratio >= 1 ? "excellent" : ratio >= 0.66 ? "competent" : ratio > 0 ? "developing" : "missing";
}

function testPassedCount(testRuns: ReviewEvidenceTestRun[] | undefined): { pass: number; total: number } {
  const runs = testRuns ?? [];
  return { pass: runs.filter((run) => run.passed).length, total: runs.length };
}

/**
 * 证据化评分聚合器：
 * - rubric：criterion.evidence 术语在文件内容 / 测试名称与消息 / diff 路径中命中；
 * - acceptance：命中且测试通过 → supported；外部声明无测试证据 → unverifiable；否则 unsupported；
 * - capabilityNote：按实际提供的证据如实声明执行范围。
 */
export function aggregateEvidenceScore(input: AggregateEvidenceInput): AggregateEvidenceOutput {
  const { project } = input;
  const fileText = buildFileText(input.fileContents);
  const testText = buildTestText(input.testRuns);
  const diffText = buildDiffText(input.repository);
  const testPassed = testPassedCount(input.testRuns);

  const rubricResults: RubricReviewItem[] = project.rubric.map((criterion) => {
    const terms = [...new Set([
      ...splitTerms(criterion.criterion),
      ...criterion.evidence.flatMap((evidence) => splitTerms(evidence)),
    ])];
    const evidence: string[] = [];
    for (const term of terms) {
      if (fileText.includes(term.toLocaleLowerCase())) {
        const file = (input.fileContents ?? []).find((file) => file.content.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
        evidence.push(`文件${file ? ` ${file.path}` : ""}包含“${term}”`);
      }
      if (testText.includes(term.toLocaleLowerCase())) {
        const run = (input.testRuns ?? []).find((run) => `${run.name}：${run.message}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
        if (run) evidence.push(`测试“${run.name}”覆盖“${term}”`);
      }
      if (diffText.includes(term.toLocaleLowerCase())) {
        const file = (input.repository?.diff.files ?? []).find((file) => file.path.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
        evidence.push(`变更文件${file ? ` ${file.path}` : ""}涉及“${term}”`);
      }
    }
    const uniqueEvidence = [...new Set(evidence)];
    const ratio = terms.length === 0 ? 0 : uniqueEvidence.length / terms.length;
    const level = levelForRatio(ratio);
    // 测试全部通过可把“实现证据”维度最低提升到 developing（有真实运行证据）。
    const effectiveLevel: RubricLevel =
      level === "missing" && testPassed.total > 0 && testPassed.pass === testPassed.total && criterion.id === "implementation"
        ? "developing"
        : level;
    return {
      criterionId: criterion.id,
      criterion: criterion.criterion,
      weight: criterion.weight,
      level: effectiveLevel,
      score: criterion.weight * LEVEL_RATIO[effectiveLevel],
      evidence: uniqueEvidence,
      missingEvidence: uniqueEvidence.length === 0 ? ["未在任何采集证据中命中"] : [],
      nextStep: uniqueEvidence.length === 0 ? "补充仓库文件、README/PRD 或可运行测试，使证据可被采集。" : "补充边界、权衡或验证依据。",
    };
  });

  const acceptanceResults: AcceptanceReviewItem[] = project.acceptanceCriteria.map((criterion) => {
    const matchedTerms = splitTerms(criterion).filter((term) =>
      fileText.includes(term.toLocaleLowerCase()) || testText.includes(term.toLocaleLowerCase()) || diffText.includes(term.toLocaleLowerCase()),
    );
    // 只允许公开测试作为验收证据；隐藏测试名称绝不进入证据字符串。
    const coveringTest = (input.testRuns ?? []).find((run) => {
      if (run.kind !== "public") return false;
      const text = `${run.name}：${run.message}`.toLocaleLowerCase();
      if (matchedTerms.length > 0) return matchedTerms.some((term) => text.includes(term.toLocaleLowerCase()));
      return text.includes(criterion.toLocaleLowerCase().slice(0, 12));
    });
    const evidence = matchedTerms.map((term) => `证据中包含“${term}”`);
    if (coveringTest) {
      if (coveringTest.passed) return { criterion, status: "supported" as const, evidence: [`测试“${coveringTest.name}”通过`], nextStep: "保留该真实测试证据，并补充边界说明。" };
      return { criterion, status: "unsupported" as const, evidence: [`测试“${coveringTest.name}”未通过`], nextStep: "修复失败测试后重新提交。" };
    }
    if (matchedTerms.length > 0) return { criterion, status: "supported" as const, evidence, nextStep: "保留该显式证据并补充边界说明。" };
    if (EXTERNAL_CLAIM.test(criterion)) return { criterion, status: "unverifiable" as const, evidence: [], nextStep: "部署/URL 类声明未被执行验证；补充真实运行记录或可复现证据。" };
    return { criterion, status: "unsupported" as const, evidence: [], nextStep: "在仓库中补充可观察、可采集的证据。" };
  });

  const facts = buildEvidenceFacts({
    repository: input.repository,
    testRuns: input.testRuns,
    runtime: input.runtime,
    fileContents: input.fileContents,
  });
  const publicCount = publicEvidenceFacts(facts).length;

  const scope: string[] = [];
  if (input.repository) scope.push(`仓库 diff（${input.repository.diff.filesChanged} 文件）`);
  const publicRuns = (input.testRuns ?? []).filter((run) => run.kind === "public");
  const hiddenRuns = (input.testRuns ?? []).filter((run) => run.kind === "hidden");
  if (publicRuns.length > 0) {
    scope.push(`公开测试 ${publicRuns.filter((run) => run.passed).length}/${publicRuns.length} 通过`);
  }
  if (hiddenRuns.length > 0) scope.push("隐藏测试已运行（仅用于服务端评分，不对外展示明细）");
  if (input.runtime) scope.push(`沙箱主执行：${input.runtime.status === "success" ? "成功" : `失败（${input.runtime.errorCode || "未知"}）`}`);
  if (input.fileContents && input.fileContents.length > 0) scope.push(`读取仓库文件 ${input.fileContents.length} 个`);

  const capabilityNote =
    scope.length > 0
      ? `证据化评分基于真实采集证据：${scope.join("；")}。未访问任何外部 URL、未验证部署地址、未读取提交历史之外的仓库内容。`
      : "证据化评分：未提供仓库、测试或沙箱运行证据，仅基于提交文本。";

  return {
    score: Math.round(rubricResults.reduce((sum, item) => sum + item.score, 0)),
    rubricResults,
    acceptanceResults,
    capabilityNote,
    evidenceFacts: facts,
  };
}

export function buildAggregateReview(input: AggregateEvidenceInput): Pick<ReviewResult, "score" | "rubricResults" | "acceptanceResults" | "capabilityNote" | "evidenceFacts"> {
  const { score, rubricResults, acceptanceResults, capabilityNote, evidenceFacts } = aggregateEvidenceScore(input);
  return { score, rubricResults, acceptanceResults, capabilityNote, evidenceFacts };
}
