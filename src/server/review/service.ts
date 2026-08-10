import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqlite } from "@/server/db/client";
import { getAiProvider } from "@/server/ai";
import type { ReviewInput, ReviewResult } from "@/server/ai";

export const appDb = drizzle(sqlite);

export async function runReview(input: ReviewInput): Promise<ReviewResult> {
  const provider = getAiProvider();
  return provider.review(input);
}

export { getAiProvider };
