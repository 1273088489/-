import OpenAI from "openai";
import type { AiProvider, CoachParams, CoachResult, ReviewInput, ReviewResult, ChoiceLabInput, ChoiceLabResult } from "./types";
import { AiProviderError, type AiOperation } from "./errors";

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
  };
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
    const system = `你是苏格拉底式全栈学习教练。只做分级提示，不直接给完整答案（除非用户已尝试并明确请求参考答案）。使用中文，只输出 JSON：{text}。`;
    const user = [
      `问题：${params.question}`,
      `当前提示级别：${params.level}（1-3 为提示，4 为参考答案）`,
      params.context ? `上下文：\n${params.context}` : "",
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
    const system = `你是资深代码审查者。按 checklist 返回评分。只允许输出 JSON：{score, summary, checklist:[{severity,message,evidence}], suggestions:[string]}。severity 取 blocker|suggestion|nit。使用中文。`;
    const user = [
      `任务：${input.taskDescription ?? "通用代码评审"}`,
      `评分标准（rubric）：${JSON.stringify(input.rubric ?? [])}`,
      `验收标准：${JSON.stringify(input.acceptanceCriteria ?? [])}`,
      `代码：\n\`\`\`\n${input.code}\n\`\`\``,
    ].join("\n");
    const text = await this.chat([{ role: "system", content: system }, { role: "user", content: user }], true, "代码评审");
    return normalizeReview(parseJsonLoose<unknown>(text, {}), this.name);
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
