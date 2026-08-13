import { describe, expect, it } from "vitest";
import {
  buildEvidenceReviewInput,
  repoSnapshotToEvidence,
  sandboxRunToEvidence,
  testRunsToEvidence,
} from "@/server/scoring/ai-review-builder";
import type { ProjectReviewContext, ReviewEvidenceInput } from "@/server/ai";
import type { RepoSnapshot } from "@/server/repo/types";
import type { SandboxRun, TestCase, TestRun } from "@/server/db/schema";

const levels = { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" };
const project: ProjectReviewContext = {
  title: "工单系统",
  description: "描述",
  acceptanceCriteria: ["README 包含运行说明"],
  rubric: [{ id: "a", criterion: "交付证据", weight: 100, evidence: ["README"], levels }],
};

function fakeSnapshot(): RepoSnapshot {
  return {
    source: { type: "url", url: "https://github.com/acme/repo.git" },
    head: { branch: "main", commitHash: "a".repeat(40), shortHash: "aaaaaaa", subject: "init", authorName: "A", authorEmail: "a@b.c", committedAt: "2026-08-12T00:00:00.000Z" },
    branches: [{ name: "main", isHead: true, isRemote: false }],
    commits: [{ hash: "a".repeat(40), shortHash: "aaaaaaa", authorName: "A", authorEmail: "a@b.c", committedAt: "2026-08-12T00:00:00.000Z", subject: "init" }],
    diff: { baseRef: "empty", filesChanged: 1, insertions: 1, deletions: 0, files: [{ path: "README.md", status: "added", insertions: 1, deletions: 0, lineRanges: [] }] },
    tree: { fileCount: 1, totalBytes: 10, largestFileBytes: 10, files: ["README.md"] },
    analyzedAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("ai-review-builder（P2-05）", () => {
  it("repoSnapshotToEvidence 投影仓库证据且不含临时路径", () => {
    const repo = repoSnapshotToEvidence(fakeSnapshot());
    expect(repo.sourceType).toBe("url");
    expect(repo.diff.files[0]).toEqual({ path: "README.md", status: "added", insertions: 1, deletions: 0 });
    expect(JSON.stringify(repo)).not.toContain("/tmp/");
  });

  it("testRunsToEvidence 保留 kind 并归一化 status", () => {
    const testCase: TestCase = {
      id: "tc-1", projectId: "p1", key: "k1", kind: "hidden", name: "隐藏基线", framework: "static-check",
      files: "{}", command: "[]", orderIndex: 0, createdAt: "", updatedAt: "",
    };
    const run: TestRun = {
      id: "tr-1", sandboxRunId: "sr-1", testCaseId: "tc-1", attemptId: "a1",
      status: "failed", passed: false, durationMs: 10, message: "FAIL", stdout: "", stderr: "", createdAt: "",
    };
    const result = testRunsToEvidence([{ run, testCase }]);
    expect(result[0]).toMatchObject({ key: "k1", kind: "hidden", passed: false, status: "failed" });
  });

  it("sandboxRunToEvidence 解析 phases JSON", () => {
    const row = {
      id: "sr-1", kind: "main", attemptId: "a1", repositorySubmissionId: "r1", runtime: "node",
      status: "failed", errorCode: "runtime-error", exitCode: 1, stdout: "", stderr: "",
      phases: JSON.stringify([{ phase: "test", label: "测试", exitCode: 1, stdout: "x", stderr: "y", durationMs: 10 }]),
      startedAt: "", finishedAt: "", durationMs: 10, timedOut: false, oomKilled: false,
      message: "boom", createdAt: "", updatedAt: "",
    } as SandboxRun;
    const runtime = sandboxRunToEvidence(row);
    expect(runtime).toMatchObject({ status: "failed", errorCode: "runtime-error", exitCode: 1, message: "boom" });
    expect(runtime?.phases[0].label).toBe("测试");
  });

  it("buildEvidenceReviewInput 把 code 置空并携带 evidence", () => {
    const input = buildEvidenceReviewInput({
      project,
      repository: repoSnapshotToEvidence(fakeSnapshot()),
      testRuns: [],
      runtime: null,
      fileContents: [{ path: "README.md", content: "运行说明" }],
    });
    expect(input.code).toBe("");
    expect(input.evidence).toBeDefined();
    const evidence = input.evidence as ReviewEvidenceInput;
    expect(evidence.fileContents?.[0].path).toBe("README.md");
    expect(evidence.runtime).toBeNull();
  });
});
