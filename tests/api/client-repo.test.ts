import { afterEach, describe, expect, it, vi } from "vitest";
import { apiProject, apiSubmitProjectArchive, apiSubmitProjectRepo } from "@/lib/client/api";
import type { RepoSnapshot } from "@/types";

afterEach(() => vi.unstubAllGlobals());

const snapshot: RepoSnapshot = {
  source: { type: "url", url: "https://github.com/acme/repo.git" },
  head: { branch: "main", commitHash: "a".repeat(40), shortHash: "aaaaaaa", subject: "init", authorName: "L", authorEmail: "l@example.com", committedAt: "2026-08-12T00:00:00.000Z" },
  branches: [{ name: "main", isHead: true, isRemote: false }],
  commits: [{ hash: "a".repeat(40), shortHash: "aaaaaaa", authorName: "L", authorEmail: "l@example.com", committedAt: "2026-08-12T00:00:00.000Z", subject: "init" }],
  diff: {
    baseRef: "empty",
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
    files: [{ path: "a.txt", status: "added", insertions: 1, deletions: 0, lineRanges: [{ startLine: 1, endLine: 1, additions: 1, deletions: 0 }] }],
  },
  tree: { fileCount: 1, totalBytes: 2, largestFileBytes: 2, files: ["a.txt"] },
  analyzedAt: "2026-08-12T00:00:00.000Z",
};

function mockFetch(data: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } }),
  ));
}

describe("仓库提交 client wrapper", () => {
  it("apiSubmitProjectRepo 发送 JSON repoUrl 并规范化快照", async () => {
    mockFetch({ attempt: { id: "attempt-1", status: "submitted", submittedAt: "2026-08-12T00:00:00.000Z" }, repository: snapshot });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const result = await apiSubmitProjectRepo("p1-static-page", "https://github.com/acme/repo.git");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/project/p1-static-page/submit",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ repoUrl: "https://github.com/acme/repo.git" }) }),
    );
    expect(result.attempt.id).toBe("attempt-1");
    expect(result.repository.head?.branch).toBe("main");
    expect(result.repository.diff.files[0].lineRanges[0]).toEqual({ startLine: 1, endLine: 1, additions: 1, deletions: 0 });
    expect(result.repository.tree.files).toEqual(["a.txt"]);
  });

  it("apiSubmitProjectArchive 发送 FormData 且不手动设置 Content-Type", async () => {
    mockFetch({ attempt: { id: "attempt-2", status: "submitted", submittedAt: "2026-08-12T00:00:00.000Z" }, repository: { ...snapshot, source: { type: "archive", archiveName: "repo.zip", archiveKind: "zip" } } });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const file = new File([Buffer.from("zip")], "repo.zip", { type: "application/zip" });

    const result = await apiSubmitProjectArchive("p1-static-page", file);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project/p1-static-page/submit");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("archive")).toBe(file);
    expect(options.headers).toBeUndefined();
    expect(result.repository.source.archiveName).toBe("repo.zip");
  });

  it("apiProject 投影包含 latestRepository", async () => {
    mockFetch({
      slug: "p1-static-page",
      title: "发布静态主页",
      description: "走通最小闭环",
      orderIndex: 0,
      tasks: [],
      acceptanceCriteria: [],
      guideMarkdown: "",
      deliverables: [],
      rubric: [],
      reflectionQuestions: [],
      status: "in_progress",
      mastery: 0,
      latestAttempt: null,
      latestRepository: {
        id: "repo-1",
        sourceType: "url",
        sourceUrl: "https://github.com/acme/repo.git",
        archiveName: "",
        archiveKind: "",
        status: "parsed",
        snapshot,
        error: "",
        submittedAt: "2026-08-12T00:00:00.000Z",
      },
      feedback: null,
    });

    const project = await apiProject("p1-static-page");
    expect(project.latestRepository).toMatchObject({
      id: "repo-1",
      status: "parsed",
      sourceUrl: "https://github.com/acme/repo.git",
    });
    expect(project.latestRepository?.snapshot?.diff.filesChanged).toBe(1);
  });
});

describe("沙箱执行 client 投影（P2-03）", () => {
  it("apiSubmitProjectRepo 返回 sandboxRun 并规范化阶段", async () => {
    mockFetch({
      attempt: { id: "attempt-1", status: "submitted", submittedAt: "2026-08-12T00:00:00.000Z" },
      repository: snapshot,
      sandboxRun: {
        id: "run-1",
        attemptId: "attempt-1",
        repositorySubmissionId: "repo-1",
        runtime: "node",
        status: "failed",
        errorCode: "runtime-error",
        exitCode: 1,
        stdout: "out",
        stderr: "err",
        phases: [{ phase: "install", label: "安装依赖", skipped: false, exitCode: 1, stdout: "", stderr: "npm ERR!", durationMs: 100 }],
        startedAt: "2026-08-12T00:00:00.000Z",
        finishedAt: "2026-08-12T00:00:01.000Z",
        durationMs: 1000,
        timedOut: false,
        oomKilled: false,
        message: "安装依赖失败（退出码 1）",
      },
    });

    const result = await apiSubmitProjectRepo("p1-static-page", "https://github.com/acme/repo.git");
    expect(result.sandboxRun).toMatchObject({
      id: "run-1",
      status: "failed",
      errorCode: "runtime-error",
      exitCode: 1,
      runtime: "node",
      message: "安装依赖失败（退出码 1）",
    });
    expect(result.sandboxRun?.phases[0]).toMatchObject({ phase: "install", exitCode: 1, stderr: "npm ERR!" });
  });

  it("apiProject 投影包含 latestSandboxRun", async () => {
    mockFetch({
      slug: "p1-static-page",
      title: "发布静态主页",
      description: "走通最小闭环",
      orderIndex: 0,
      tasks: [],
      acceptanceCriteria: [],
      guideMarkdown: "",
      deliverables: [],
      rubric: [],
      reflectionQuestions: [],
      status: "in_progress",
      mastery: 0,
      latestAttempt: null,
      latestRepository: null,
      latestSandboxRun: {
        id: "run-2",
        attemptId: "attempt-1",
        repositorySubmissionId: "repo-1",
        runtime: "static",
        status: "success",
        errorCode: "",
        exitCode: 0,
        stdout: "STATIC_VERIFY files=2",
        stderr: "",
        phases: [{ phase: "verify", label: "静态文件校验", skipped: false, exitCode: 0, stdout: "STATIC_VERIFY files=2", stderr: "", durationMs: 5 }],
        startedAt: "2026-08-12T00:00:00.000Z",
        finishedAt: "2026-08-12T00:00:00.100Z",
        durationMs: 100,
        timedOut: false,
        oomKilled: false,
        message: "",
      },
      feedback: null,
    });

    const project = await apiProject("p1-static-page");
    expect(project.latestSandboxRun).toMatchObject({ id: "run-2", status: "success", runtime: "static" });
    expect(project.latestSandboxRun?.phases[0]).toMatchObject({ phase: "verify", exitCode: 0 });
  });
});
