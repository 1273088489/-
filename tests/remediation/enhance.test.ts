// P2-06 AI 增强解释测试：best-effort，任何 AI 失败都回退到规则摘要。
import { describe, expect, it, vi } from "vitest";
import { enhancePathExplanation } from "@/server/remediation";
import type { StoredRemediationItem } from "@/server/remediation";

const BASE = "规则摘要：得分 55/100，共 2 步。";
const ITEMS: StoredRemediationItem[] = [
  {
    id: "item-1",
    orderIndex: 0,
    contentType: "lesson",
    contentId: "lesson-s1",
    contentSlug: "s1-dev-environment",
    title: "第 1 阶段课时",
    reason: "r",
    criteria: "完成该课时",
  },
  {
    id: "item-2",
    orderIndex: 1,
    contentType: "project",
    contentId: "project-p1",
    contentSlug: "p1-static-page",
    title: "项目 1",
    reason: "r",
    criteria: "重新提交",
  },
];

describe("enhancePathExplanation", () => {
  it("appends an AI suggestion when the provider succeeds", async () => {
    const result = await enhancePathExplanation({
      base: BASE,
      items: ITEMS,
      provider: { coach: vi.fn().mockResolvedValue({ text: "先复习课时，再完成练习。", level: 2, mode: "hint" }) },
    });
    expect(result).toContain(BASE);
    expect(result).toContain("**AI 学习建议**");
    expect(result).toContain("先复习课时");
  });

  it("falls back to the rule summary when the provider throws", async () => {
    const result = await enhancePathExplanation({
      base: BASE,
      items: ITEMS,
      provider: { coach: vi.fn().mockRejectedValue(new Error("provider down")) },
    });
    expect(result).toBe(BASE);
  });

  it("falls back when the provider returns empty text", async () => {
    const result = await enhancePathExplanation({
      base: BASE,
      items: ITEMS,
      provider: { coach: vi.fn().mockResolvedValue({ text: "", level: 2, mode: "hint" }) },
    });
    expect(result).toBe(BASE);
  });

  it("does not call the provider when there are no items", async () => {
    const coach = vi.fn();
    const result = await enhancePathExplanation({ base: BASE, items: [], provider: { coach } });
    expect(result).toBe(BASE);
    expect(coach).not.toHaveBeenCalled();
  });
});
