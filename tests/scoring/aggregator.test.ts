import { describe, expect, it } from "vitest";
import { aggregateEvidenceScore } from "@/server/scoring/aggregator";
import type { ProjectReviewContext, ReviewEvidenceInput } from "@/server/ai";

const levels = {
  excellent: "证据完整",
  competent: "核心证据完整",
  developing: "证据不完整",
  missing: "没有证据",
};

const project: ProjectReviewContext = {
  title: "工单系统静态页",
  description: "交付可审查的静态说明页",
  acceptanceCriteria: [
    "提交中包含一个以 http:// 或 https:// 开头的发布地址",
    "README 包含本地运行命令、预期页面标题",
    "仓库包含 HTML、CSS 和 README 文件，且 git log 至少显示 2 个提交",
  ],
  rubric: [
    { id: "implementation", criterion: "实现与项目任务一致", weight: 40, evidence: ["页面包含工单名称、目标用户"], levels },
    { id: "verification", criterion: "验收结论有可审查证据", weight: 35, evidence: ["README 包含本地运行命令"], levels },
    { id: "decision-record", criterion: "设计决策及取舍有记录", weight: 25, evidence: ["PRD 记录范围、验收标准和被放弃方案"], levels },
  ],
};

const evidence: ReviewEvidenceInput = {
  repository: {
    sourceType: "url",
    head: { branch: "main", shortHash: "abc1234", subject: "init" },
    branches: [],
    commits: [],
    diff: {
      baseRef: "empty",
      filesChanged: 2,
      insertions: 12,
      deletions: 0,
      files: [
        { path: "index.html", status: "added", insertions: 6, deletions: 0 },
        { path: "README.md", status: "added", insertions: 6, deletions: 0 },
      ],
    },
    tree: { fileCount: 2, totalBytes: 200, files: ["index.html", "README.md"] },
  },
  testRuns: [
    { key: "p1-public-content", name: "说明页包含名称、目标用户与项目链接", kind: "public", passed: true, status: "passed", durationMs: 100, message: "OK: 全部检查通过", framework: "static-check" },
    { key: "p1-hidden-docs", name: "隐藏基线检查", kind: "hidden", passed: true, status: "passed", durationMs: 90, message: "OK: 全部检查通过", framework: "static-check" },
  ],
  runtime: {
    status: "success",
    errorCode: "",
    exitCode: 0,
    durationMs: 500,
    timedOut: false,
    oomKilled: false,
    message: "",
    phases: [{ phase: "verify", label: "静态文件校验", exitCode: 0, durationMs: 100, stdout: "ok", stderr: "" }],
  },
  fileContents: [
    { path: "README.md", content: "# 工单系统\n本地运行命令：npx serve .\n预期页面标题：工单系统\nPRD 记录范围、验收标准和一个被放弃方案\n" },
    { path: "index.html", content: "<h1>工单系统</h1><p>目标用户：客服</p>" },
  ],
};

describe("aggregateEvidenceScore 证据化评分（P2-05）", () => {
  it("rubric 证据引用文件内容与公开测试，隐藏测试名称不进入证据字符串", () => {
    const result = aggregateEvidenceScore({ project, ...evidence });
    const allEvidence = result.rubricResults.flatMap((item) => item.evidence).join(" ");
    const allAcceptance = result.acceptanceResults.flatMap((item) => item.evidence).join(" ");

    // 文件内容证据
    expect(allEvidence).toContain("README");
    expect(allEvidence).toContain("PRD");
    // 公开测试证据
    expect(allEvidence).toContain("说明页包含名称、目标用户与项目链接");
    // 隐藏测试名称绝不出现
    expect(allEvidence).not.toContain("隐藏基线检查");
    expect(allAcceptance).not.toContain("隐藏基线检查");

    const implementation = result.rubricResults.find((item) => item.criterionId === "implementation")!;
    expect(implementation.evidence.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("capabilityNote 如实声明执行范围：测试/沙箱/文件读取已声明，外部 URL 未验证", () => {
    const result = aggregateEvidenceScore({ project, ...evidence });
    expect(result.capabilityNote).toContain("公开测试 1/1 通过");
    expect(result.capabilityNote).toContain("沙箱主执行：成功");
    expect(result.capabilityNote).toContain("读取仓库文件 2 个");
    expect(result.capabilityNote).toMatch(/未访问任何外部 URL、未验证部署地址/);

    // 部署/URL 类验收标准无测试证据时标记 unverifiable
    const urlCriterion = result.acceptanceResults.find((item) => item.criterion.includes("http"));
    expect(urlCriterion?.status).toBe("unverifiable");
  });

  it("测试全部失败时 implementation 不获得测试通过提升", () => {
    const failing = aggregateEvidenceScore({
      project,
      repository: evidence.repository,
      testRuns: [
        { key: "p1-public-content", name: "说明页包含名称、目标用户与项目链接", kind: "public", passed: false, status: "failed", durationMs: 100, message: "FAIL: 缺少名称", framework: "static-check" },
        { key: "p1-hidden-docs", name: "隐藏基线检查", kind: "hidden", passed: false, status: "failed", durationMs: 90, message: "FAIL: 缺 README", framework: "static-check" },
      ],
      runtime: evidence.runtime,
      fileContents: evidence.fileContents,
    });
    expect(failing.capabilityNote).toContain("公开测试 0/1 通过");
    expect(failing.capabilityNote).not.toContain("隐藏基线检查");
  });

  it("没有任何证据输入时 capabilityNote 声明仅基于提交文本", () => {
    const result = aggregateEvidenceScore({ project });
    expect(result.capabilityNote).toContain("仅基于提交文本");
    expect(result.evidenceFacts).toEqual([]);
    expect(result.score).toBe(0);
  });
});
