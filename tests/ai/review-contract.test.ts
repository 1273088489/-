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

describe("review providers evidence input（P2-05）", () => {
  const project: ProjectReviewContext = {
    title: "工单项目",
    description: "仓库提交",
    acceptanceCriteria: ["README 包含运行说明"],
    rubric: [{ id: "delivery", criterion: "交付证据", weight: 100, evidence: ["README"], levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" } }],
  };
  const evidence = {
    repository: {
      sourceType: "url" as const,
      head: { branch: "main", shortHash: "abc", subject: "init" },
      branches: [],
      commits: [],
      diff: { baseRef: "empty", filesChanged: 1, insertions: 1, deletions: 0, files: [{ path: "README.md", status: "added", insertions: 1, deletions: 0 }] },
      tree: { fileCount: 1, totalBytes: 10, files: ["README.md"] },
    },
    testRuns: [
      { key: "p1-public", name: "说明页包含名称", kind: "public" as const, passed: true, status: "passed" as const, durationMs: 10, message: "OK", framework: "static-check" },
      { key: "p1-hidden", name: "隐藏基线", kind: "hidden" as const, passed: true, status: "passed" as const, durationMs: 10, message: "OK", framework: "static-check" },
    ],
    runtime: { status: "success" as const, errorCode: "", exitCode: 0, durationMs: 10, timedOut: false, oomKilled: false, message: "", phases: [] },
    fileContents: [{ path: "README.md", content: "本地运行命令：npm start" }],
  };

  it("OpenAI evidence prompt 包含真实证据并约束能力声明", () => {
    const messages = buildOpenAiReviewMessages({ code: "", project, evidence });
    const prompt = messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("README.md");
    expect(prompt).toContain("说明页包含名称");
    expect(prompt).toContain("沙箱主执行");
    expect(prompt).toMatch(/capabilityNote 必须如实声明实际执行范围/);
    expect(prompt).toMatch(/evidenceFacts 的 sourceType 只能是 git_diff、test_output、file_content、runtime/);
    expect(prompt).toMatch(/隐藏测试结果仅供内部评分/);
    expect(prompt).not.toContain("taskDescription");
  });

  it("Mock evidence review 的 evidenceFacts 全部来自真实证据来源", async () => {
    const result = await new MockAiProvider().review({ code: "", project, evidence });
    expect(result.evidenceFacts?.every((fact) => ["git_diff", "test_output", "file_content", "runtime"].includes(fact.sourceType))).toBe(true);
    expect(result.evidenceFacts?.some((fact) => fact.sourceType === "runtime")).toBe(true);
  });
});
