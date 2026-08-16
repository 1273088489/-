"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import { ApiError, apiExercise, apiSubmitExercise } from "@/lib/client/api";
import type { ExerciseDetail, ExerciseResult } from "@/types";

export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visibleHints, setVisibleHints] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const DRAFT_KEY_PREFIX = "exercise-draft:";

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const ex = await apiExercise(id);
      setExercise(ex);
      // 恢复草稿
      if (ex.answerType !== "choices") {
        const saved = localStorage.getItem(DRAFT_KEY_PREFIX + ex.id);
        if (saved !== null) {
          setAnswer(saved);
          setDraftRestored(true);
        }
      }
    } catch (err) {
      setExercise(null);
      setError(err instanceof ApiError ? err.message : "练习加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 自动保存草稿（非选择题）
  useEffect(() => {
    if (!exercise || exercise.answerType === "choices" || !answer.trim()) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY_PREFIX + exercise.id, answer);
    }, 500);
    return () => clearTimeout(timer);
  }, [exercise, answer]);

  // 提交后清除草稿
  useEffect(() => {
    if (result && exercise) {
      localStorage.removeItem(DRAFT_KEY_PREFIX + exercise.id);
      setDraftRestored(false);
    }
  }, [result, exercise]);

  function handleAnswerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab 缩进
    if (event.key === "Tab") {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = answer.substring(0, start) + "  " + answer.substring(end);
      setAnswer(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
    // Ctrl+Enter / Cmd+Enter 提交
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const form = event.currentTarget.closest("form");
      if (form) form.requestSubmit();
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!exercise || !answer.trim()) {
      setSubmitError("请先填写或选择答案。");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const next = await apiSubmitExercise(exercise.id, answer);
      setResult(next);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "答案提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageShell><LoadingView label="正在加载练习…" /></PageShell>;
  if (error && !exercise) return <PageShell><ErrorView message={error} onRetry={load} /></PageShell>;
  if (!exercise) {
    return <PageShell><EmptyView message="练习不存在" hint="请返回课时重新选择练习。" action={<Link href="/dashboard" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">返回仪表盘</Link>} /></PageShell>;
  }

  const textAreaClass = "min-h-44 w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm leading-6 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/lesson/${exercise.lessonSlug}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← {exercise.lessonTitle}</Link>
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-indigo-600">{answerTypeLabel(exercise.answerType)}</p>
            <h1 className="mt-2 text-xl font-bold leading-8 text-gray-950">{exercise.prompt}</h1>
          </div>
          <span className="shrink-0 text-sm font-semibold text-gray-500">{exercise.mastery ?? 0}%</span>
        </div>
        <ProgressBar value={exercise.mastery ?? 0} className="mt-5" />

       <form onSubmit={handleSubmit} className="mt-8">
          <section className="mb-6 rounded-lg border border-indigo-100 bg-indigo-50 p-4"><h2 className="text-sm font-semibold text-indigo-900">提交前标准</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-indigo-900/80">{exercise.rubric.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-xs leading-5 text-indigo-900/70">文本题和代码题使用形成性启发式；系统未运行代码，也没有隐藏测试。</p></section>
          {exercise.answerType === "choices" ? (
            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-semibold text-gray-800">选择一个答案</legend>
              {exercise.choices.map((choice) => (
                <label key={choice} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${answer === choice ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input type="radio" name="answer" value={choice} checked={answer === choice} onChange={(event) => setAnswer(event.target.value)} className="mt-1 accent-indigo-600" />
                  <span className="text-sm leading-6 text-gray-800">{choice}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="answer" className="text-sm font-semibold text-gray-800">{exercise.answerType === "code" ? "你的代码" : "你的回答"}</label>
                <div className="flex items-center gap-2">
                  {draftRestored ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">已恢复草稿</span> : null}
                  {exercise.answerType === "code" ? <span className="text-xs text-gray-400">Tab 缩进 · Ctrl+Enter 提交</span> : null}
                </div>
              </div>
              <textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={handleAnswerKeyDown} placeholder={exercise.answerType === "code" ? "在这里粘贴或编写代码…" : "说明你的思路、步骤与取舍…"} className={textAreaClass} spellCheck={exercise.answerType !== "code"} />
            </div>
          )}

          {submitError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p> : null}
          <button type="submit" disabled={submitting || !answer.trim()} className="mt-5 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? "判分中…" : "提交答案"}
          </button>
        </form>
      </section>

      {exercise.hints.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">分级提示</h2>
              <p className="mt-1 text-sm text-gray-500">先独立思考，需要时逐条查看。</p>
            </div>
            <button type="button" disabled={visibleHints >= exercise.hints.length} onClick={() => setVisibleHints((count) => Math.min(exercise.hints.length, count + 1))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40">显示下一条</button>
          </div>
          {visibleHints > 0 ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-700">{exercise.hints.slice(0, visibleHints).map((hint) => <li key={hint}>{hint}</li>)}</ol> : null}
        </section>
      ) : null}

      {result ? (
        <section className={`mt-6 rounded-2xl border p-6 ${result.correct ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={`text-lg font-bold ${result.correct ? "text-emerald-800" : "text-amber-900"}`}>{result.correct ? "回答正确" : "继续打磨"}</h2>
            <span className="text-sm font-semibold text-gray-700">掌握度 {result.mastery}%</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-700">{result.feedback}</p>
          {result.rubricResults?.length ? <div className="mt-4"><p className="text-sm font-semibold text-gray-800">逐项形成性反馈</p><div className="mt-2 space-y-2">{result.rubricResults.map((item) => <div key={item.criterion} className="rounded-lg border border-gray-200 p-3 text-xs"><p className="font-medium">{item.criterion} · {item.evidenceStatus === "supported" ? "已有证据" : "缺失证据"}</p><p className="mt-1 text-gray-600">已有：{item.evidence.join("、") || "无"}；缺失：{item.missingEvidence.join("、") || "无"}；下一步：{item.nextStep}</p></div>)}</div></div> : null}
        </section>
      ) : null}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</div>;
}

function answerTypeLabel(type: ExerciseDetail["answerType"]): string {
  return type === "choices" ? "选择题" : type === "code" ? "代码题" : "问答题";
}
