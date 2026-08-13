"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import { ApiError, apiProject, apiSubmitProject, apiSubmitProjectArchive, apiSubmitProjectRepo, apiRemediationPaths, apiCompleteRemediationPath } from "@/lib/client/api";
import Markdown from "@/components/Markdown";
import type { ProjectDetail, RemediationPathRecord, RepoSnapshot, RepoSubmissionRecord, RepoSubmissionResult, ReviewResult, ReviewSeverity, TestCaseRecord, TestRunRecord } from "@/types";

const SEVERITY_META: Record<ReviewSeverity, { label: string; cls: string }> = {
  blocker: { label: "阻止项", cls: "bg-red-100 text-red-700" },
  suggestion: { label: "建议", cls: "bg-amber-100 text-amber-800" },
  nit: { label: "微调", cls: "bg-gray-100 text-gray-600" },
};

export default function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoFile, setRepoFile] = useState<File | null>(null);
  const [repoSubmitting, setRepoSubmitting] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoResult, setRepoResult] = useState<RepoSubmissionResult | null>(null);
  const [remediation, setRemediation] = useState<RemediationPathRecord | null>(null);
  const [remediationError, setRemediationError] = useState<string | null>(null);
  const [completingRemediation, setCompletingRemediation] = useState(false);

  const loadRemediation = useCallback(async (projectSlug: string) => {
    try {
      const paths = await apiRemediationPaths(projectSlug);
      setRemediation(paths[0] ?? null);
      setRemediationError(null);
    } catch {
      setRemediation(null);
      setRemediationError("补课路径加载失败");
    }
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiProject(slug);
      setProject(data);
      setCode(data.latestAttempt?.code ?? "");
      setReview(data.feedback ?? null);
      setRepoResult(data.latestRepository?.snapshot
        ? { attempt: { id: data.latestRepository.id, status: data.latestRepository.status, submittedAt: data.latestRepository.submittedAt }, repository: data.latestRepository.snapshot, publicTests: data.publicTests ?? [], testRuns: data.publicTestRuns ?? [], review: data.feedback ?? null }
        : null);
      void loadRemediation(slug);
    } catch (err) {
      setProject(null);
      setError(err instanceof ApiError ? err.message : "项目加载失败");
    } finally {
      setLoading(false);
    }
  }, [slug, loadRemediation]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || code.trim().length < 10) {
      setSubmitError("请提交至少 10 个字符的代码或实现说明。");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      setReview(await apiSubmitProject(project.slug, code));
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "项目提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRepoUrlSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || repoUrl.trim().length === 0) {
      setRepoError("请输入 https:// 仓库地址。");
      return;
    }
    setRepoSubmitting(true);
    setRepoError(null);
    try {
      const result = await apiSubmitProjectRepo(project.slug, repoUrl.trim());
      setRepoResult(result);
      setReview(result.review ?? null);
      void loadRemediation(project.slug);
    } catch (err) {
      setRepoResult(null);
      setRepoError(err instanceof ApiError ? err.message : "仓库接收失败，请稍后重试。");
    } finally {
      setRepoSubmitting(false);
    }
  }

  async function handleArchiveSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !repoFile) {
      setRepoError("请选择 .zip 或 .tar.gz 压缩包。");
      return;
    }
    setRepoSubmitting(true);
    setRepoError(null);
    try {
      const result = await apiSubmitProjectArchive(project.slug, repoFile);
      setRepoResult(result);
      setReview(result.review ?? null);
      void loadRemediation(project.slug);
    } catch (err) {
      setRepoResult(null);
      setRepoError(err instanceof ApiError ? err.message : "仓库接收失败，请稍后重试。");
    } finally {
      setRepoSubmitting(false);
    }
  }

  async function handleCompleteRemediation() {
    if (!remediation) return;
    setCompletingRemediation(true);
    setRemediationError(null);
    try {
      const updated = await apiCompleteRemediationPath(remediation.id);
      setRemediation(updated);
      // 完成补课会提升项目 mastery/status，刷新项目详情。
      setProject(await apiProject(remediation.projectSlug));
    } catch (err) {
      setRemediationError(err instanceof ApiError ? err.message : "完成补课失败，请稍后重试。");
    } finally {
      setCompletingRemediation(false);
    }
  }

  if (loading) return <PageShell><LoadingView label="正在加载项目…" /></PageShell>;
  if (error && !project) return <PageShell><ErrorView message={error} onRetry={load} /></PageShell>;
  if (!project) return <PageShell><EmptyView message="项目不存在" action={<Link href="/dashboard" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">返回仪表盘</Link>} /></PageShell>;

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={project.courseSlug ? `/course/${project.courseSlug}` : "/dashboard"} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← {project.courseTitle ?? "返回课程"}</Link>
      </div>

      <header className="mt-6 border-b border-gray-200 pb-8">
        <p className="text-sm font-semibold text-violet-600">阶段项目 {project.orderIndex + 1}</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-950">{project.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-gray-600">{project.description}</p>
        <div className="mt-5 max-w-sm"><ProgressBar value={project.mastery ?? 0} showLabel label="项目掌握度" /></div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={handleSubmit}>
          <label htmlFor="project-code" className="text-lg font-bold text-gray-950">提交实现</label>
          <p className="mt-1 text-sm text-gray-500">粘贴关键代码或完整实现，AI 会按验收标准给出分级审查。</p>
          <textarea id="project-code" value={code} onChange={(event) => setCode(event.target.value)} className="mt-4 min-h-[28rem] w-full resize-y rounded-xl border border-gray-300 bg-gray-950 p-4 font-mono text-sm leading-6 text-gray-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="// 在这里粘贴你的实现…" spellCheck={false} />
          {submitError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p> : null}
          <div className="mt-4 flex items-center gap-4">
            <button type="submit" disabled={submitting || code.trim().length < 10} className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "评审中…" : "提交并评审"}</button>
            <span className="text-xs text-gray-400">{code.length} 字符</span>
          </div>
        </form>

        <RepoPanel
          repoUrl={repoUrl}
          onRepoUrlChange={setRepoUrl}
          repoFile={repoFile}
          onRepoFileChange={setRepoFile}
          repoSubmitting={repoSubmitting}
          repoError={repoError}
          repoResult={repoResult}
          onRepoUrlSubmit={handleRepoUrlSubmit}
          onArchiveSubmit={handleArchiveSubmit}
          latestRepository={project.latestRepository ?? null}
        />

        <aside className="space-y-6">
          <section className="border-t border-gray-200 pt-5"><h2 className="text-base font-semibold text-gray-950">项目指南</h2><Markdown source={project.guideMarkdown} className="mt-3" /></section>
          <Checklist title="交付物" items={project.deliverables} />
          <Checklist title="任务清单" items={project.tasks} numbered />
          <Checklist title="验收标准" items={project.acceptanceCriteria} />
          <RubricPanel rubric={project.rubric} />
          <Checklist title="复盘问题" items={project.reflectionQuestions} />
        </aside>
      </div>

      <TestRunPanel publicTests={project.publicTests ?? []} testRuns={repoResult?.testRuns ?? project.publicTestRuns ?? []} />

      <RemediationPanel
        path={remediation}
        error={remediationError}
        completing={completingRemediation}
        onComplete={handleCompleteRemediation}
      />

      {review ? <ReviewPanel review={review} /> : <EmptyView className="mt-10" message="等待首次评审" hint="提交实现后，这里会显示评分、问题清单和下一步建议。" />}
    </PageShell>
  );
}

function RemediationPanel({ path, error, completing, onComplete }: {
  path: RemediationPathRecord | null;
  error: string | null;
  completing: boolean;
  onComplete: () => void;
}) {
  if (!path) return null;
  const completedCount = path.items.filter((item) => item.completed).length;
  const active = path.status === "active";
  const allCompleted = path.items.length > 0 && completedCount === path.items.length;
  return (
    <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-950">个性化补课路径</h2>
          <p className="mt-1 text-sm text-gray-500">{path.summary} · {active ? "进行中" : "已完成"} · 完成 {completedCount} / {path.items.length} 项</p>
        </div>
        {active ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={completing || !allCompleted}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completing ? "处理中…" : "完成补课"}
          </button>
        ) : null}
      </div>
      {!allCompleted && active ? <p className="mt-2 text-xs text-gray-500">完成全部补课项后，可点击“完成补课”提升项目掌握度。</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p> : null}
      <ol className="mt-4 space-y-3">
        {path.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.completed ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {item.completed ? "✓" : item.orderIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={item.url} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">{item.title}</Link>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{typeLabel(item.contentType)}</span>
                {item.completed ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">已完成</span> : null}
              </div>
              <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
              <p className="mt-0.5 text-xs text-gray-400">完成判定：{item.criteria}</p>
            </div>
          </li>
        ))}
      </ol>
      {path.explanation ? <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-gray-600">{path.explanation}</p> : null}
    </section>
  );
}

function typeLabel(type: string): string {
  return type === "lesson" ? "课时" : type === "exercise" ? "练习" : "项目";
}

function Checklist({ title, items, numbered = false }: { title: string; items: string[]; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <section className="border-t border-gray-200 pt-5">
      <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      {items.length === 0 ? <p className="mt-3 text-sm text-gray-500">暂无内容。</p> : <List className={`${numbered ? "list-decimal" : "list-disc"} mt-3 space-y-2 pl-5 text-sm leading-6 text-gray-700`}>{items.map((item) => <li key={item}>{item}</li>)}</List>}
    </section>
  );
}

function ReviewPanel({ review }: { review: ReviewResult }) {
  return (
    <section className="mt-10 border-t border-gray-200 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-indigo-600">AI 代码审查</p><h2 className="mt-1 text-2xl font-bold text-gray-950">{review.score} / 100</h2></div>
        <span className="text-xs text-gray-500">评审来源：{review.provider}</span>
      </div>
      <p className="mt-4 max-w-4xl text-sm leading-7 text-gray-700">{review.summary}</p>
      {review.capabilityNote ? <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-700">{review.capabilityNote}</p> : null}
      {review.evidenceFacts?.length ? <div className="mt-6"><h3 className="text-sm font-semibold text-gray-900">评分证据</h3><p className="mt-1 text-xs text-gray-500">以下证据来自真实采集：仓库 diff、沙箱运行、测试运行与仓库文件内容。</p><ul className="mt-3 space-y-2">{review.evidenceFacts.map((fact) => <li key={`${fact.sourceType}-${fact.label}-${fact.ref}`} className="rounded-lg border border-gray-200 p-3 text-xs leading-5 text-gray-700"><span className="font-medium">{fact.label}</span><span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{fact.sourceType}</span><p className="mt-1 whitespace-pre-wrap text-gray-600">{fact.detail}</p></li>)}</ul></div> : null}
      {review.rubricResults?.length ? <div className="mt-6"><h3 className="text-sm font-semibold text-gray-900">Rubric 逐项反馈</h3><div className="mt-3 space-y-2">{review.rubricResults.map((item) => <div key={item.criterionId} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium">{item.criterion} · {item.level} · {item.score} 分</p><p className="mt-1 text-xs text-gray-600">已有证据：{item.evidence.join("、") || "无"}；缺失证据：{item.missingEvidence.join("、") || "无"}；下一步：{item.nextStep}</p></div>)}</div></div> : null}
      {review.acceptanceResults?.length ? <div className="mt-6"><h3 className="text-sm font-semibold text-gray-900">验收证据状态</h3><div className="mt-3 space-y-2">{review.acceptanceResults.map((item) => <div key={item.criterion} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium">{item.criterion} · {item.status === "supported" ? "有证据支持" : item.status === "unsupported" ? "无证据支持" : "当前无法验证"}</p><p className="mt-1 text-xs text-gray-600">证据：{item.evidence.join("、") || "无"}；下一步：{item.nextStep}</p></div>)}</div></div> : null}
      <div className="mt-6 space-y-3">
        {review.checklist.map((item, index) => {
          const meta = SEVERITY_META[item.severity] ?? SEVERITY_META.suggestion;
          return <div key={`${item.message}-${index}`} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start gap-3"><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span><div><p className="text-sm font-medium text-gray-900">{item.message}</p>{item.evidence ? <p className="mt-1 text-xs leading-5 text-gray-500">依据：{item.evidence}</p> : null}</div></div></div>;
        })}
      </div>
      {review.suggestions.length > 0 ? <div className="mt-6 rounded-xl bg-indigo-50 p-5"><h3 className="text-sm font-semibold text-indigo-900">下一轮建议</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-indigo-900/80">{review.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
    </section>
  );
}

function RubricPanel({ rubric }: { rubric: ProjectDetail["rubric"] }) { return <section className="border-t border-gray-200 pt-5"><h2 className="text-base font-semibold text-gray-950">评分 Rubric</h2><div className="mt-3 space-y-3">{rubric.map((item) => <div key={item.id} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium">{item.criterion} · 权重 {item.weight}%</p><p className="mt-1 text-xs text-gray-600">证据：{item.evidence.join("、")}</p><ul className="mt-2 space-y-1 text-xs text-gray-600"><li>优秀：{item.levels.excellent}</li><li>胜任：{item.levels.competent}</li><li>发展中：{item.levels.developing}</li><li>缺失：{item.levels.missing}</li></ul></div>)}</div></section>; }

function RepoPanel({ repoUrl, onRepoUrlChange, repoFile, onRepoFileChange, repoSubmitting, repoError, repoResult, onRepoUrlSubmit, onArchiveSubmit, latestRepository }: {
  repoUrl: string;
  onRepoUrlChange: (value: string) => void;
  repoFile: File | null;
  onRepoFileChange: (file: File | null) => void;
  repoSubmitting: boolean;
  repoError: string | null;
  repoResult: RepoSubmissionResult | null;
  onRepoUrlSubmit: (event: React.FormEvent) => void;
  onArchiveSubmit: (event: React.FormEvent) => void;
  latestRepository: RepoSubmissionRecord | null;
}) {
  const snapshot = repoResult?.repository ?? latestRepository?.snapshot ?? null;
  return (
    <section className="mt-10 rounded-2xl border border-gray-200 p-5">
      <h2 className="text-lg font-bold text-gray-950">提交 Git 仓库（可选）</h2>
      <p className="mt-1 text-sm text-gray-500">粘贴公开仓库 https 地址，或上传 .zip / .tar.gz 压缩包。系统会解析仓库，并在受限 Docker 沙箱（无网络、限额资源）中执行公开与隐藏测试。</p>

      <form onSubmit={onRepoUrlSubmit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={repoUrl}
            onChange={(event) => onRepoUrlChange(event.target.value)}
            placeholder="https://github.com/you/your-repo.git"
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            disabled={repoSubmitting}
          />
          <button type="submit" disabled={repoSubmitting || repoUrl.trim().length === 0} className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{repoSubmitting ? "接收中…" : "接收仓库"}</button>
        </div>
      </form>

      <form onSubmit={onArchiveSubmit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="file"
            accept=".zip,.tar.gz,.tgz"
            onChange={(event) => onRepoFileChange(event.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
            disabled={repoSubmitting}
          />
          <button type="submit" disabled={repoSubmitting || !repoFile} className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{repoSubmitting ? "上传中…" : "上传并解析"}</button>
        </div>
      </form>

      {repoError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{repoError}</p> : null}
      {latestRepository?.status === "failed" && !repoResult ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">上次仓库接收失败：{latestRepository.error || "未知错误"}</p> : null}
      {snapshot ? <RepoSnapshotView snapshot={snapshot} /> : <p className="mt-4 text-sm text-gray-400">尚未提交仓库。</p>}
    </section>
  );
}

function RepoSnapshotView({ snapshot }: { snapshot: RepoSnapshot }) {
  const head = snapshot.head;
  const files = snapshot.tree.files.slice(0, 30);
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <p className="font-semibold text-slate-900">仓库解析结果</p>
      <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <p>来源：{snapshot.source.type === "url" ? (snapshot.source.url ?? "URL") : `压缩包 ${snapshot.source.archiveName ?? ""}`}</p>
        <p>文件数：{snapshot.tree.fileCount} · 总大小：{formatBytes(snapshot.tree.totalBytes)}</p>
        {head ? <p>HEAD：{head.branch} @ {head.shortHash}</p> : <p>HEAD：上传包（无 Git 历史）</p>}
        <p>分支：{snapshot.branches.length} · 提交：{snapshot.commits.length}</p>
        <p>变更：{snapshot.diff.filesChanged} 文件 · +{snapshot.diff.insertions} / -{snapshot.diff.deletions}</p>
        <p>分析时间：{new Date(snapshot.analyzedAt).toLocaleString()}</p>
      </div>
      {head ? <p className="mt-2 text-xs text-slate-500">{head.subject}</p> : null}
      {files.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-indigo-600">查看文件列表（前 {files.length} 个）</summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-slate-600">
            {files.map((file) => <li key={file}>{file}</li>)}
          </ul>
        </details>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">仓库解析完成后会自动在受限沙箱中执行项目；公开测试结果展示在本页，隐藏测试仅用于评分，不对外展示。</p>
    </div>
  );
}

function TestRunPanel({ publicTests, testRuns }: { publicTests: TestCaseRecord[]; testRuns: TestRunRecord[] }) {
  if (publicTests.length === 0 && testRuns.length === 0) {
    return (
      <section className="mt-10 border-t border-gray-200 pt-8">
        <h2 className="text-base font-semibold text-gray-950">公开测试</h2>
        <p className="mt-3 text-sm text-gray-500">提交 Git 仓库后，这里会显示沙箱内公开测试的逐项结果。</p>
      </section>
    );
  }
  const merged = publicTests.map((testCase) => ({
    ...testCase,
    run: testRuns.find((run) => run.testCaseId === testCase.id) ?? null,
  }));
  const passedCount = merged.filter((item) => item.run?.passed).length;
  return (
    <section className="mt-10 border-t border-gray-200 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-base font-semibold text-gray-950">公开测试</h2><p className="mt-1 text-sm text-gray-500">在受限沙箱中执行；每项通过/失败、耗时与消息均来自真实运行证据。</p></div>
        <span className="text-xs text-gray-500">通过 {passedCount} / {merged.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {merged.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">框架：{item.framework}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.run ? (item.run.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700") : "bg-gray-100 text-gray-600"}`}>
                {item.run ? (item.run.passed ? "通过" : "未通过") : "未运行"}
              </span>
            </div>
            {item.run ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <p>耗时：{item.run.durationMs}ms</p>
                {item.run.message ? <p className="mt-1 whitespace-pre-wrap font-mono">{item.run.message}</p> : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">尚未运行：提交仓库后自动执行。</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</div>;
}
