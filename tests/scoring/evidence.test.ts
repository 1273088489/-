import { describe, expect, it, vi } from "vitest";
import {
  buildEvidenceFacts,
  buildFileContentFacts,
  buildGitDiffFacts,
  buildRuntimeFacts,
  buildTestOutputFacts,
  collectFileContentFacts,
  fileFactsToContents,
  publicEvidenceFacts,
} from "@/server/scoring";
import type { EvidenceFact, ReviewEvidenceInput } from "@/server/ai";

describe("buildEvidenceFacts 证据来源分类（P2-05）", () => {
  it("从 diff/测试/运行时/文件内容生成四类证据，隐藏测试标记 internal", () => {
    const input: ReviewEvidenceInput = {
      repository: {
        sourceType: "url",
        head: { branch: "main", shortHash: "abc1234", subject: "init" },
        branches: [],
        commits: [],
        diff: {
          baseRef: "empty",
          filesChanged: 2,
          insertions: 10,
          deletions: 2,
          files: [
            { path: "README.md", status: "added", insertions: 8, deletions: 0 },
            { path: "index.html", status: "modified", insertions: 2, deletions: 2 },
          ],
        },
        tree: { fileCount: 2, totalBytes: 100, files: ["README.md", "index.html"] },
      },
      testRuns: [
        { key: "p1-public-a", name: "页面包含核心信息", kind: "public", passed: true, status: "passed", durationMs: 100, message: "OK", framework: "static-check" },
        { key: "p1-hidden-b", name: "隐藏基线", kind: "hidden", passed: false, status: "failed", durationMs: 50, message: "FAIL: 缺 README", framework: "static-check" },
      ],
      runtime: {
        status: "success",
        errorCode: "",
        exitCode: 0,
        durationMs: 1234,
        timedOut: false,
        oomKilled: false,
        message: "",
        phases: [{ phase: "verify", label: "静态文件校验", exitCode: 0, durationMs: 100, stdout: "ok", stderr: "" }],
      },
      fileContents: [{ path: "README.md", content: "本地运行命令" }],
    };

    const facts = buildEvidenceFacts(input);
    const types = new Set(facts.map((fact) => fact.sourceType));
    expect(types).toEqual(new Set(["git_diff", "test_output", "file_content", "runtime"]));

    const hidden = facts.filter((fact) => fact.internal === true);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].ref).toBe("test:p1-hidden-b");
    expect(hidden[0].label).toContain("隐藏测试");

    const publicFacts = publicEvidenceFacts(facts);
    expect(publicFacts.some((fact) => fact.internal === true)).toBe(false);
    expect(publicFacts.some((fact) => fact.ref === "test:p1-hidden-b")).toBe(false);
    expect(publicFacts.some((fact) => fact.ref === "test:p1-public-a")).toBe(true);
  });

  it("缺少证据输入时不生成对应来源的事实", () => {
    expect(buildGitDiffFacts(undefined)).toEqual([]);
    expect(buildTestOutputFacts(undefined)).toEqual([]);
    expect(buildRuntimeFacts(null)).toEqual([]);
    expect(buildFileContentFacts(undefined)).toEqual([]);
    expect(buildEvidenceFacts({})).toEqual([]);
  });
});

describe("fileFactsToContents 文件内容进入评分输入", () => {
  it("只挑选 file_content 事实并截断", () => {
    const facts: EvidenceFact[] = [
      { sourceType: "file_content", label: "文件：README.md", detail: "x".repeat(5000), ref: "file:README.md" },
      { sourceType: "runtime", label: "沙箱主执行", detail: "ok", ref: "run:main" },
    ];
    const contents = fileFactsToContents(facts, 100, 10_000);
    expect(contents).toHaveLength(1);
    expect(contents[0].path).toBe("README.md");
    expect(contents[0].content.length).toBeLessThanOrEqual(100 + 10);
  });
});

describe("collectFileContentFacts 受限读取仓库文本文件（不执行）", () => {
  it("读取 README/index.html 并跳过 node_modules 与二进制", async () => {
    vi.doMock("@/server/runner/materialize", () => ({
      materializeRepository: async () => {
        const fs = await import("node:fs");
        const os = await import("node:os");
        const path = await import("node:path");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qz-evidence-"));
        fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
        fs.writeFileSync(path.join(dir, "README.md"), "# 工单系统\n本地运行命令：npm start\n");
        fs.writeFileSync(path.join(dir, "index.html"), "<h1>工单系统</h1>");
        fs.writeFileSync(path.join(dir, "node_modules", "x.js"), "skip me");
        fs.writeFileSync(path.join(dir, "logo.png"), Buffer.from([0, 1, 2, 3]));
        return { projectDir: dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
      },
    }));
    vi.resetModules();
    try {
      const { collectFileContentFacts: collect } = await import("@/server/scoring/evidence");
      const facts = await collect({ type: "url", url: "https://github.com/acme/repo.git" });
      const paths = facts.map((fact) => fact.ref);
      expect(paths).toContain("file:README.md");
      expect(paths).toContain("file:index.html");
      expect(paths.some((ref) => (ref ?? "").includes("node_modules"))).toBe(false);
      expect(paths.some((ref) => (ref ?? "").includes("logo.png"))).toBe(false);
    } finally {
      vi.doUnmock("@/server/runner/materialize");
      vi.resetModules();
    }
  });
});
