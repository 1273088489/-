import { MockAiProvider } from "./mock";
import { OpenAiProvider } from "./openai";
import type { AiProvider, ProviderName } from "./types";

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const name: ProviderName = (process.env.AI_PROVIDER as ProviderName) || "mock";
  if (name === "openai" && process.env.OPENAI_API_KEY) {
    cached = new OpenAiProvider();
  } else {
    cached = new MockAiProvider();
  }
  return cached;
}

export function resetAiProvider() {
  cached = null;
}

export { MockAiProvider, OpenAiProvider };
export type {
  AiProvider,
  CoachParams,
  CoachResult,
  ProjectReviewContext,
  ReviewInput,
  ReviewResult,
  ChoiceLabInput,
  ChoiceLabResult,
  EvidenceFact,
  EvidenceFactSourceType,
  ReviewEvidenceInput,
  ReviewEvidenceRepository,
  ReviewEvidenceTestRun,
  ReviewEvidenceRuntime,
  ReviewEvidenceFileContent,
  RubricLevel,
  RubricReviewItem,
  AcceptanceReviewItem,
  EvidenceStatus,
} from "./types";
