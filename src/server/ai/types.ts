// AI 适配层契约。所有 AI 能力通过本接口，便于 mock / 真实 provider 切换。

export interface CoachParams {
  question: string;
  level: number; // 1..3 hints, or 4 = solution
  context?: string; // 当前课程/练习/代码上下文
}

export interface CoachResult {
  text: string;
  level: number;
  mode: "hint" | "solution";
}

export interface ReviewInput {
  code: string;
  taskDescription?: string;
  rubric?: string[];
  acceptanceCriteria?: string[];
}

export interface ReviewChecklistItem {
  severity: "blocker" | "suggestion" | "nit";
  message: string;
  evidence?: string;
}

export interface ReviewResult {
  score: number; // 0-100
  summary: string;
  checklist: ReviewChecklistItem[];
  suggestions: string[];
  provider: string;
}

export interface ChoiceLabInput {
  scenario: string;
  options: string[];
  selectedOption: string;
  rationale: string;
}

export interface ChoiceLabResult {
  score: number; // 0-100
  feedback: string;
}

export interface AiProvider {
  readonly name: string;
  coach(params: CoachParams): Promise<CoachResult>;
  review(input: ReviewInput): Promise<ReviewResult>;
  evaluateChoice(input: ChoiceLabInput): Promise<ChoiceLabResult>;
}

export type ProviderName = "openai" | "mock";
