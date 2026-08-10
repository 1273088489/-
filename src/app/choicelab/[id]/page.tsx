"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import { ApiError, apiChoiceScenario, apiSubmitChoice } from "@/lib/client/api";
import { demoChoiceScenario, evaluateDemoChoice } from "@/lib/demoData";
import type { ChoiceOption, ChoiceScenario, ChoiceSubmissionResult } from "@/types";

export default function ChoiceLabDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scenario, setScenario] = useState<ChoiceScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [selected, setSelected] = useState("");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ChoiceSubmissionResult | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setScenario(await apiChoiceScenario(id));
      setUsingDemo(false);
    } catch (err) {
      const fallback = demoChoiceScenario(id);
      setScenario(fallback);
      setUsingDemo(Boolean(fallback));
      if (!fallback) setError(err instanceof ApiError ? err.message : "场景加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) {
      setSubmitError("请先选择一个方案。");
      return;
    }
    if (rationale.trim().length < 20) {
      setSubmitError("请至少用 20 个字符说明你的需求与取舍。");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      setResult(usingDemo ? evaluateDemoChoice(rationale) : await apiSubmitChoice(id, selected, rationale));
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageShell><LoadingView label="正在加载实验…" /></PageShell>;
  if (error && !scenario) return <PageShell><ErrorView message={error} onRetry={load} /></PageShell>;
  if (!scenario) return <PageShell><EmptyView message="实验场景不存在" action={<Link href="/choicelab" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">返回实验列表</Link>} /></PageShell>;

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/choicelab" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← 返回实验列表</Link>
        {usingDemo ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">演示评估</span> : null}
      </div>

      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold text-indigo-600">{scenario.category ?? "技术决策"}</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-950">{scenario.title}</h1>
        <p className="mt-4 text-base leading-8 text-gray-700">{scenario.description}</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <fieldset>
            <legend className="text-base font-semibold text-gray-950">选择方案</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {scenario.options.map((option) => {
                const value = optionValue(option);
                const detail = typeof option === "string" ? null : option.detail;
                return <label key={value} className={`cursor-pointer rounded-xl border p-4 transition ${selected === value ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-gray-200 hover:border-gray-300"}`}><div className="flex items-start gap-3"><input type="radio" name="option" value={value} checked={selected === value} onChange={(event) => setSelected(event.target.value)} className="mt-1 accent-indigo-600" /><div><span className="text-sm font-semibold text-gray-900">{value}</span>{detail ? <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p> : null}</div></div></label>;
              })}
            </div>
          </fieldset>

          <div className="mt-7">
            <label htmlFor="rationale" className="text-base font-semibold text-gray-950">决策记录</label>
            <p className="mt-1 text-sm text-gray-500">写明需求约束、候选方案取舍、主要风险和迁移成本。</p>
            <textarea id="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} className="mt-3 min-h-64 w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm leading-7 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="当前需求是… 我选择… 因为… 主要风险是… 如果需求变化，可以…" />
            <div className="mt-2 flex justify-between text-xs text-gray-400"><span>建议 120-300 字</span><span>{rationale.length} 字</span></div>
          </div>
          {submitError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p> : null}
          <button type="submit" disabled={submitting || !selected || rationale.trim().length < 20} className="mt-5 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "评估中…" : "提交决策"}</button>
        </div>

        <aside className="border-t border-gray-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="text-sm font-semibold text-gray-950">ADR 检查点</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
            <li><strong className="text-gray-900">1. 需求</strong><br />哪些约束真正影响决策？</li>
            <li><strong className="text-gray-900">2. 候选</strong><br />为什么没有选择其他方案？</li>
            <li><strong className="text-gray-900">3. 风险</strong><br />这个方案最可能在哪里失败？</li>
            <li><strong className="text-gray-900">4. 迁移</strong><br />需求变化时如何调整？</li>
          </ol>
        </aside>
      </form>

      {result ? <section className="mt-10 border-t border-gray-200 pt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-indigo-600">AI 决策反馈</p><h2 className="mt-1 text-2xl font-bold text-gray-950">{result.score} / 100</h2></div></div><ProgressBar value={result.score} className="mt-4 max-w-md" /><p className="mt-5 max-w-3xl rounded-xl bg-indigo-50 p-5 text-sm leading-7 text-indigo-950">{result.feedback}</p></section> : null}
    </PageShell>
  );
}

function optionValue(option: string | ChoiceOption): string {
  return typeof option === "string" ? option : option.label;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</div>;
}
