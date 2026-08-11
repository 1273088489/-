import type { AcceptanceReviewItem, ProjectReviewContext, ReviewResult, RubricLevel, RubricReviewItem } from "@/server/ai/types";

const LEVEL_RATIO: Record<RubricLevel, number> = { excellent: 1, competent: 0.8, developing: 0.5, missing: 0 };
const EXTERNAL_CLAIM = new RegExp("测试(?:结果)?(?:已)?通过|git (?:log|history)|提交历史|仓库(?:已)?访问|部署(?:地址)?(?:可打开|可访问|已验证)|(?:url|网址|线上地址|发布地址)|https?://", "i");

export function matchExplicitEvidence(sourceText: string, criterion: string): {
  evidence: string[];
  missingEvidence: string[];
  supported: boolean;
} {
  const source = sourceText.toLocaleLowerCase();
  const terms = [...new Set(
    criterion
      .split(/[，。；：、\s`'"()（）]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  )];
  const evidence = terms.filter((term) => source.includes(term.toLocaleLowerCase()));
  const missingEvidence = terms.filter((term) => !evidence.includes(term));

  return {
    evidence,
    missingEvidence,
    supported: terms.length > 0 && missingEvidence.length === 0,
  };
}

export function reviewProjectEvidence(code: string, project: ProjectReviewContext): Pick<ReviewResult, "score" | "rubricResults" | "acceptanceResults" | "capabilityNote"> {
  const source = code.toLocaleLowerCase();
  const rubricResults: RubricReviewItem[] = project.rubric.map((criterion) => {
    const evidence = criterion.evidence.filter((item) => source.includes(item.toLocaleLowerCase()));
    const missingEvidence = criterion.evidence.filter((item) => !evidence.includes(item));
    const ratio = criterion.evidence.length === 0 ? 0 : evidence.length / criterion.evidence.length;
    const level: RubricLevel = ratio >= 1 ? "excellent" : ratio >= 0.66 ? "competent" : ratio > 0 ? "developing" : "missing";
    return {
      criterionId: criterion.id,
      criterion: criterion.criterion,
      weight: criterion.weight,
      level,
      score: criterion.weight * LEVEL_RATIO[level],
      evidence,
      missingEvidence,
      nextStep: missingEvidence.length ? "补充证据：" + missingEvidence.join("、") : "说明边界、权衡或验证依据。",
    };
  });
  const acceptanceResults: AcceptanceReviewItem[] = project.acceptanceCriteria.map((criterion) => {
    const { evidence, supported } = matchExplicitEvidence(source, criterion);
    const status = EXTERNAL_CLAIM.test(criterion) ? "unverifiable" : supported ? "supported" : "unsupported";
    return { criterion, status, evidence, nextStep: status === "supported" ? "保留该显式证据并补充边界说明。" : "在提交文本中补充可观察证据。" };
  });
  return {
    score: Math.round(rubricResults.reduce((sum, item) => sum + item.score, 0)),
    rubricResults,
    acceptanceResults,
    capabilityNote: "这是形成性启发式评审，只分析提交文本中的显式证据；系统未运行代码，未访问外部资源，也未读取 Git 历史、仓库、部署或测试结果。",
  };
}
