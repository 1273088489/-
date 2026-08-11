import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { sqlite } from "@/server/db/client";
import { parseJson } from "@/server/ai/json";
import { getAiProvider } from "@/server/ai";
import type { ProjectReviewContext, ReviewInput, ReviewResult } from "@/server/ai";
import type { ProjectRubricCriterion } from "@/types";

export const appDb = drizzle(sqlite);

export const ReviewInputSchema = z.object({
  code: z.string().refine((value) => value.trim().length > 0, "代码不能为空").max(100_000, "代码过长"),
}).strict();

const projectRubricCriterionSchema = z.object({
  id: z.string().trim().min(1),
  criterion: z.string().trim().min(1),
  weight: z.number().int().positive(),
  evidence: z.array(z.string().trim().min(1)).min(1),
  levels: z.object({
    excellent: z.string().trim().min(1),
    competent: z.string().trim().min(1),
    developing: z.string().trim().min(1),
    missing: z.string().trim().min(1),
  }),
});

const projectRubricSchema = z.array(projectRubricCriterionSchema).min(3).superRefine((criteria, context) => {
  const ids = new Set<string>();
  for (const [index, criterion] of criteria.entries()) {
    if (ids.has(criterion.id)) context.addIssue({ code: "custom", message: "criterion IDs must be unique", path: [index, "id"] });
    ids.add(criterion.id);
  }
  if (criteria.reduce((total, criterion) => total + criterion.weight, 0) !== 100) context.addIssue({ code: "custom", message: "criterion weights must total 100" });
});

export function parseProjectRubric(raw: string): ProjectRubricCriterion[] | null {
  const parsed = projectRubricSchema.safeParse(parseJson(raw, []));
  return parsed.success ? parsed.data : null;
}

export function buildProjectReviewInput(input: { code: string } & ProjectReviewContext): ReviewInput {
  return {
    code: input.code,
    project: {
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      rubric: input.rubric,
    },
  };
}

export { reviewProjectEvidence } from "./evidence";

export async function runReview(input: ReviewInput): Promise<ReviewResult> {
  const provider = getAiProvider();
  return provider.review(input);
}

export { getAiProvider };
