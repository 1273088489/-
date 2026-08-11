import { describe, expect, it } from "vitest";
import { reviewProjectEvidence } from "@/server/review/service";
import type { ProjectReviewContext } from "@/server/ai/types";
import { MockAiProvider } from "@/server/ai/mock";
import { buildOpenAiReviewMessages } from "@/server/ai/openai";

const levels = {
  excellent: "证据完整",
  competent: "核心证据完整",
  developing: "证据不完整",
  missing: "没有证据",
};

describe("project formative review contract", () => {
  it("sums fixed level ratios before rounding and reports evidence per rubric item", () => {
    const project: ProjectReviewContext = {
      title: "工单项目",
      description: "提交可审查证据",
      acceptanceCriteria: [],
      rubric: [
        { id: "a", criterion: "维度 A", weight: 25, evidence: ["A1", "A2"], levels },
        { id: "b", criterion: "维度 B", weight: 25, evidence: ["B1", "B2"], levels },
        { id: "c", criterion: "维度 C", weight: 25, evidence: ["C1", "C2", "C3"], levels },
        { id: "d", criterion: "维度 D", weight: 25, evidence: ["D1"], levels },
      ],
    };

    const result = reviewProjectEvidence("A1 B1 C1 C2", project);

    expect(result.score).toBe(45);
    expect(result.rubricResults?.map((item) => item.level)).toEqual([
      "developing",
      "developing",
      "competent",
      "missing",
    ]);
    expect(result.rubricResults?.[0]).toMatchObject({
      evidence: ["A1"],
      missingEvidence: ["A2"],
      nextStep: expect.stringContaining("A2"),
    });
  });

  it("reports acceptance separately and never claims external verification", () => {
    const project: ProjectReviewContext = {
      title: "工单项目",
      description: "提交可审查证据",
      acceptanceCriteria: ["README 包含本地运行说明", "部署地址可打开", "错误状态有明确提示"],
      rubric: [],
    };

    const result = reviewProjectEvidence("README 包含本地运行说明；错误状态有明确提示", project);

    expect(result.acceptanceResults?.map((item) => item.status)).toEqual([
      "supported",
      "unverifiable",
      "supported",
    ]);
    expect(result.capabilityNote).toMatch(/只分析提交文本.*未运行代码.*未.*访问.*外部资源/);
  });

  it("does not treat one matching word as support for a multi-part criterion", () => {
    const project: ProjectReviewContext = {
      title: "工单项目",
      description: "提交可审查证据",
      acceptanceCriteria: ["README 包含本地运行说明"],
      rubric: [],
    };

    const result = reviewProjectEvidence("README", project);

    expect(result.acceptanceResults?.[0]).toMatchObject({
      status: "unsupported",
      evidence: ["README"],
      nextStep: expect.stringContaining("补充"),
    });
  });

  it("treats a submitted publication URL as evidence text, not verified deployment", () => {
    const project: ProjectReviewContext = {
      title: "工单项目",
      description: "提交可审查证据",
      acceptanceCriteria: ["提交中包含一个以 http:// 或 https:// 开头的发布地址"],
      rubric: [],
    };

    const result = reviewProjectEvidence("发布地址：https://example.com", project);

    expect(result.acceptanceResults?.[0]).toMatchObject({
      status: "unverifiable",
      evidence: expect.arrayContaining([expect.stringMatching(/发布地址|https/)]),
    });
  });
});

describe("review providers", () => {
  const project: ProjectReviewContext = {
    title: "工单项目",
    description: "只依据提交文本评审",
    acceptanceCriteria: ["README 包含运行说明", "部署地址可打开"],
    rubric: [
      { id: "delivery", criterion: "交付证据", weight: 60, evidence: ["README", "ADR"], levels },
      { id: "quality", criterion: "质量证据", weight: 40, evidence: ["边界测试"], levels },
    ],
  };

  it("Mock returns rubric and acceptance evidence without external claims", async () => {
    const result = await new MockAiProvider().review({ code: "README 与 ADR", project });

    expect(result.score).toBe(60);
    expect(result.rubricResults).toHaveLength(2);
    expect(result.acceptanceResults?.map((item) => item.status)).toEqual(["unsupported", "unverifiable"]);
    expect(result.checklist.map((item) => item.message).join(" ")).toMatch(/交付证据.*质量证据.*README 包含运行说明.*部署地址可打开/);
    expect(result.capabilityNote).toMatch(/未运行代码.*未访问外部资源/);
  });

  it("OpenAI prompt locks the project context and evidence vocabulary", () => {
    const messages = buildOpenAiReviewMessages({ code: "README", project });
    const prompt = messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("工单项目");
    expect(prompt).toContain("交付证据");
    expect(prompt).toMatch(/有证据支持.*无证据支持.*当前无法验证/);
    expect(prompt).toMatch(/不得声称.*运行代码.*访问.*外部资源/);
    expect(prompt).not.toContain("taskDescription");
  });
});
