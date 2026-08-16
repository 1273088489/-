import OpenAI from "openai";
import type {
  AiProvider,
  CoachParams,
  CoachResult,
  EvidenceFactSourceType,
  ReviewInput,
  ReviewResult,
  ChoiceLabInput,
  ChoiceLabResult,
} from "./types";
import { AiProviderError, type AiOperation } from "./errors";
import { reviewProjectEvidence } from "@/server/review/evidence";
import { aggregateEvidenceScore } from "@/server/scoring/aggregator";

function parseJsonLoose<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const src = match ? match[1] : raw;
    const start = src.indexOf("{");
    const end = src.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;
    return JSON.parse(src.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

const RUBRIC_LEVELS = ["excellent", "competent", "developing", "missing"] as const;
const ACCEPTANCE_STATUSES = ["supported", "unsupported", "unverifiable"] as const;
const EVIDENCE_SOURCE_TYPES: EvidenceFactSourceType[] = ["git_diff", "test_output", "file_content", "runtime"];

function normalizeRubricResults(value: unknown): ReviewResult["rubricResults"] {
  if (!Array.isArray(value)) return undefined;
  const results: NonNullable<ReviewResult["rubricResults"]> = [];
  for (const item of value) {
    const entry = asRecord(item);
    if (typeof entry.criterionId !== "string" || typeof entry.criterion !== "string") continue;
    const level = RUBRIC_LEVELS.includes(entry.level as (typeof RUBRIC_LEVELS)[number])
      ? (entry.level as (typeof RUBRIC_LEVELS)[number])
      : "missing";
    results.push({
      criterionId: entry.criterionId,
      criterion: entry.criterion,
      weight: typeof entry.weight === "number" ? entry.weight : 0,
      level,
      score: typeof entry.score === "number" ? Math.max(0, Math.min(100, Math.round(entry.score))) : 0,
      evidence: asStringArray(entry.evidence),
      missingEvidence: asStringArray(entry.missingEvidence),
      nextStep: typeof entry.nextStep === "string" ? entry.nextStep : "",
    });
  }
  return results.length > 0 ? results : undefined;
}

function normalizeAcceptanceResults(value: unknown): ReviewResult["acceptanceResults"] {
  if (!Array.isArray(value)) return undefined;
  const results: NonNullable<ReviewResult["acceptanceResults"]> = [];
  for (const item of value) {
    const entry = asRecord(item);
    if (typeof entry.criterion !== "string") continue;
    const status = ACCEPTANCE_STATUSES.includes(entry.status as (typeof ACCEPTANCE_STATUSES)[number])
      ? (entry.status as (typeof ACCEPTANCE_STATUSES)[number])
      : "unsupported";
    results.push({
      criterion: entry.criterion,
      status,
      evidence: asStringArray(entry.evidence),
      nextStep: typeof entry.nextStep === "string" ? entry.nextStep : "",
    });
  }
  return results.length > 0 ? results : undefined;
}

function normalizeEvidenceFacts(value: unknown): ReviewResult["evidenceFacts"] {
  if (!Array.isArray(value)) return undefined;
  const facts: NonNullable<ReviewResult["evidenceFacts"]> = [];
  for (const item of value) {
    const entry = asRecord(item);
    if (!EVIDENCE_SOURCE_TYPES.includes(entry.sourceType as EvidenceFactSourceType)) continue;
    if (typeof entry.label !== "string" || !entry.label.trim()) continue;
    facts.push({
      sourceType: entry.sourceType as EvidenceFactSourceType,
      label: entry.label,
      detail: typeof entry.detail === "string" ? entry.detail : "",
      ...(typeof entry.ref === "string" && entry.ref ? { ref: entry.ref } : {}),
      ...(entry.internal === true ? { internal: true } : {}),
    });
  }
  return facts.length > 0 ? facts : undefined;
}

function normalizeReview(value: unknown, provider: string): ReviewResult {
  const data = asRecord(value);
  const checklist: ReviewResult["checklist"] = [];
  if (Array.isArray(data.checklist)) {
    for (const item of data.checklist) {
      const entry = asRecord(item);
      const severity = entry.severity;
      if (severity !== "blocker" && severity !== "suggestion" && severity !== "nit") continue;
      if (typeof entry.message !== "string" || !entry.message.trim()) continue;
      checklist.push({
        severity,
        message: entry.message,
        ...(typeof entry.evidence === "string" ? { evidence: entry.evidence } : {}),
      });
    }
  }
  return {
    score: scoreValue(data.score, 60),
    summary: typeof data.summary === "string" && data.summary.trim() ? data.summary : "AI 未返回有效的结构化评审。",
    checklist,
    suggestions: asStringArray(data.suggestions),
    provider,
    ...(typeof data.capabilityNote === "string" && data.capabilityNote.trim() ? { capabilityNote: data.capabilityNote } : {}),
    ...(normalizeRubricResults(data.rubricResults) ? { rubricResults: normalizeRubricResults(data.rubricResults) } : {}),
    ...(normalizeAcceptanceResults(data.acceptanceResults) ? { acceptanceResults: normalizeAcceptanceResults(data.acceptanceResults) } : {}),
    ...(normalizeEvidenceFacts(data.evidenceFacts) ? { evidenceFacts: normalizeEvidenceFacts(data.evidenceFacts) } : {}),
  };
}

function evidencePromptPart(input: ReviewInput): string {
  const evidence = input.evidence!;
  const parts: string[] = [];
  if (evidence.repository) {
    const repo = evidence.repository;
    parts.push(
      `仓库：${repo.sourceType === "url" ? "Git URL" : "上传包"}；HEAD：${repo.head ? `${repo.head.branch} @ ${repo.head.shortHash}（${repo.head.subject}）` : "无 Git 历史"}`,
      `分支 ${repo.branches.length} 个；提交 ${repo.commits.length} 条；文件树 ${repo.tree.fileCount} 个文件（共 ${repo.tree.totalBytes} 字节）`,
      `diff：${repo.diff.filesChanged} 文件 +${repo.diff.insertions} / -${repo.diff.deletions}；文件列表：${repo.diff.files.map((file) => `${file.path}(${file.status})`).join("、") || "无"}`,
    );
  }
  if (evidence.testRuns && evidence.testRuns.length > 0) {
    parts.push("测试运行结果（隐藏测试仅供内部评分，不得对外暴露标识或明细）：");
    for (const run of evidence.testRuns) {
      parts.push(`- [${run.kind === "hidden" ? "隐藏" : "公开"}] ${run.name}: ${run.passed ? "通过" : `${run.status}：${run.message}`}（${run.durationMs}ms）`);
    }
  }
  if (evidence.runtime) {
    const runtime = evidence.runtime;
    parts.push(`沙箱主执行：${runtime.status === "success" ? "成功" : `失败（${runtime.errorCode || "未知"}）`}，退出码 ${runtime.exitCode ?? "无"}，耗时 ${runtime.durationMs}ms${runtime.message ? `，说明：${runtime.message}` : ""}`);
    if (runtime.phases.length > 0) {
      parts.push(`阶段：${runtime.phases.map((phase) => `${phase.label}${phase.skipped ? "(跳过)" : ""}:${phase.exitCode ?? "?"}`).join(" / ")}`);
    }
  }
  if (evidence.fileContents && evidence.fileContents.length > 0) {
    parts.push("仓库文件内容（截断）：");
    for (const file of evidence.fileContents) {
      parts.push(`--- ${file.path} ---\n${file.content}`);
    }
  }
  return parts.join("\n");
}

export function buildOpenAiReviewMessages(input: ReviewInput): Array<{ role: "system" | "user"; content: string }> {
  if (input.evidence) {
    const system = [
      "你是证据化形成性评审者。只依据提供的真实证据评分：仓库 diff、测试运行结果（公开+隐藏）、沙箱主运行结果与仓库文件内容。",
      "禁止声称执行了证据中不存在的动作（例如未提供的部署验证、未运行的测试、未读取的文件）。",
      "隐藏测试结果仅供内部评分，summary/checklist/evidenceFacts 中不得暴露隐藏测试的标识或明细。",
      "按每个 rubric 维度和验收标准分别返回 JSON：{score, summary, checklist, suggestions, rubricResults, acceptanceResults, evidenceFacts, capabilityNote}。",
      "rubric 等级只能是 excellent、competent、developing、missing，并按权重计算总分（0-100）。",
      "验收状态只能是有证据支持（supported）、无证据支持（unsupported）、当前无法验证（unverifiable）。",
      "evidenceFacts 的 sourceType 只能是 git_diff、test_output、file_content、runtime，且必须来自提供的证据；capabilityNote 必须如实声明实际执行范围（运行了哪些测试、是否读取仓库文件、未访问外部资源）。",
    ].join(" ");
    const user = [
      "项目：" + input.project.title,
      "项目描述：" + input.project.description,
      "Rubric：" + JSON.stringify(input.project.rubric),
      "验收标准：" + JSON.stringify(input.project.acceptanceCriteria),
      "已采集证据：\n" + evidencePromptPart(input),
    ].join("\n");
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }
  const system = "你是形成性评审者。只评价提交文本中的显式证据，不得声称运行代码、执行测试、读取 Git 历史、访问仓库、打开 URL、验证部署或访问任何外部资源。按每个 rubric 维度和验收标准分别返回 JSON；验收状态只能是有证据支持、无证据支持、当前无法验证。rubric 等级只能是 excellent、competent、developing、missing，并按权重计算总分。";
  const user = [
    "项目：" + input.project.title,
    "项目描述：" + input.project.description,
    "Rubric：" + JSON.stringify(input.project.rubric),
    "验收标准：" + JSON.stringify(input.project.acceptanceCriteria),
    "提交文本：\n" + input.code,
  ].join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/**
 * OpenAiProvider — 适配任何 OpenAI 兼容接口（baseURL 可配）。
 * 需要 OPENAI_API_KEY（或 OPENAI_BASE_URL 指向兼容服务）。
 * 全部请求使用结构化指令，并要求 JSON 输出，出错时安全降级。
 */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAiProvider requires OPENAI_API_KEY");
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  private async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    json: boolean,
    operation: AiOperation,
  ) {
    try {
      const resp = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.3,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      });
      return resp.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw new AiProviderError(operation, error);
    }
  }

  async coach(params: CoachParams): Promise<CoachResult> {
    const system = [
      "你是苏格拉底式全栈学习教练。只做分级提示，不直接给完整答案（除非用户已尝试并明确请求参考答案）。",
      "如果用户提供了上下文（当前页面/课时/练习/项目），请结合该上下文给出针对性建议，让回答贴合当前学习场景。",
      "使用中文，回复以 Markdown 格式输出。只输出 JSON：{text}。",
    ].join("\n");
    const user = [
      `问题：${params.question}`,
      `当前提示级别：${params.level}（1-3 为提示，4 为参考答案）`,
      params.context ? `用户当前学习场景：${params.context}\n请结合上述场景上下文给出针对性帮助。` : "",
    ].join("\n");
    const text = await this.chat([{ role: "system", content: system }, { role: "user", content: user }], true, "教练");
    const data = parseJsonLoose<Record<string, unknown>>(text, {});
    return {
      text: typeof data.text === "string" && data.text.trim() ? data.text : "AI 未返回有效的教练回复，请重试。",
      level: params.level,
      mode: params.level >= 4 ? "solution" : "hint",
    };
  }

  async review(input: ReviewInput): Promise<ReviewResult> {
    if (input.evidence) {
      const evidenceReview = aggregateEvidenceScore({
        project: input.project,
        repository: input.evidence.repository,
        testRuns: input.evidence.testRuns,
        runtime: input.evidence.runtime,
        fileContents: input.evidence.fileContents,
      });
      const text = await this.chat(buildOpenAiReviewMessages(input), true, "代码评审");
      const parsed = parseJsonLoose<unknown>(text, {});
      const normalized = normalizeReview(parsed, this.name);
      // AI 未返回 score 时回退到证据聚合分，而不是默认 60（避免掩盖真实证据结论）。
      const rawScore = asRecord(parsed).score;
      const score = typeof rawScore === "number" && Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : evidenceReview.score;
      return {
        ...normalized,
        score,
        summary: normalized.summary !== "AI 未返回有效的结构化评审。" ? normalized.summary : `AI 证据化评审：基于仓库 diff、测试与沙箱运行证据，按项目 rubric 得分 ${evidenceReview.score}/100。`,
        rubricResults: normalized.rubricResults && normalized.rubricResults.length > 0 ? normalized.rubricResults : evidenceReview.rubricResults,
        acceptanceResults: normalized.acceptanceResults && normalized.acceptanceResults.length > 0 ? normalized.acceptanceResults : evidenceReview.acceptanceResults,
        capabilityNote: normalized.capabilityNote?.trim() ? normalized.capabilityNote : evidenceReview.capabilityNote,
        evidenceFacts: evidenceReview.evidenceFacts,
        provider: this.name,
      };
    }

    const text = await this.chat(buildOpenAiReviewMessages(input), true, "代码评审");
    const normalized = normalizeReview(parseJsonLoose<unknown>(text, {}), this.name);
    const evidenceReview = reviewProjectEvidence(input.code, input.project);
    return { ...normalized, ...evidenceReview, score: evidenceReview.score };
  }

  async evaluateChoice(input: ChoiceLabInput): Promise<ChoiceLabResult> {
    const system = `你是架构评审。评价学习者的技术选型论证质量，不看是否命中“标准答案”，而看需求约束、权衡、风险与迁移成本是否被论证。只输出 JSON：{score, feedback}。使用中文。`;
    const user = [
      `场景：${input.scenario}`,
      `候选方案：${JSON.stringify(input.options)}`,
      `学习者选择：${input.selectedOption}`,
      `学习者理由：\n${input.rationale}`,
    ].join("\n");
    const text = await this.chat([{ role: "system", content: system }, { role: "user", content: user }], true, "选型评估");
    const data = asRecord(parseJsonLoose<unknown>(text, {}));
    return {
      score: scoreValue(data.score, 50),
      feedback: typeof data.feedback === "string" && data.feedback.trim() ? data.feedback : "AI 未返回有效的选型反馈，请重试。",
    };
  }
}
