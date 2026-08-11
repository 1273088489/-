"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import { ApiError, apiProject, apiSubmitProject } from "@/lib/client/api";
import Markdown from "@/components/Markdown";
import type { ProjectDetail, ReviewResult, ReviewSeverity } from "@/types";

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

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiProject(slug);
      setProject(data);
      setCode(data.latestAttempt?.code ?? "");
      setReview(data.feedback ?? null);
    } catch (err) {
      setProject(null);
      setError(err instanceof ApiError ? err.message : "项目加载失败");
    } finally {
      setLoading(false);
    }
  }, [slug]);

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

        <aside className="space-y-6">
          <section className="border-t border-gray-200 pt-5"><h2 className="text-base font-semibold text-gray-950">项目指南</h2><Markdown source={project.guideMarkdown} className="mt-3" /></section>
          <Checklist title="交付物" items={project.deliverables} />
          <Checklist title="任务清单" items={project.tasks} numbered />
          <Checklist title="验收标准" items={project.acceptanceCriteria} />
          <RubricPanel rubric={project.rubric} />
          <Checklist title="复盘问题" items={project.reflectionQuestions} />
        </aside>
      </div>

      {review ? <ReviewPanel review={review} /> : <EmptyView className="mt-10" message="等待首次评审" hint="提交实现后，这里会显示评分、问题清单和下一步建议。" />}
    </PageShell>
  );
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

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</div>;
}
