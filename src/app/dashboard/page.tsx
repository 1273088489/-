"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiProgress } from "@/lib/client/api";
import { demoCourseFallback } from "@/lib/demoData";
import { Card, EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import type { LearningStatus, ProgressOverview } from "@/types";

const STATUS_LABELS: Record<LearningStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  needs_review: "待复习",
};

/** 学习仪表盘：整体进度、最近活动、继续学习。 */
export default function DashboardPage() {
  const [progress, setProgress] = useState<ProgressOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiProgress();
      setProgress(data);
      setUsingDemo(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "进度加载失败");
      setProgress(demoCourseFallback());
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <LoadingView label="正在加载学习进度…" />
      </div>
    );
  }

  if (error && !progress) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ErrorView message={error} onRetry={load} />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <EmptyView message="暂无学习数据" hint="开始学习后，这里会展示你的进度与最近活动。" action={<Link href="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">去选课</Link>} />
      </div>
    );
  }

  const statItems: Array<{ label: string; value: string; sub?: string }> = [
    { label: "整体掌握度", value: `${progress.overallMastery ?? 0}%`, sub: "加权平均" },
    { label: "课时", value: `${progress.completedLessons ?? 0}/${progress.totalLessons ?? 0}`, sub: "已完成" },
    { label: "练习", value: `${progress.completedExercises ?? 0}/${progress.totalExercises ?? 0}`, sub: "已完成" },
    { label: "项目", value: `${progress.completedProjects ?? 0}/${progress.totalProjects ?? 0}`, sub: "已完成" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">学习仪表盘</h1>
          <p className="mt-1 text-sm text-gray-500">你的全栈学习旅程，从这里继续。</p>
        </div>
        {usingDemo ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">演示数据（API 未就绪）</span>
        ) : null}
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statItems.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className="mt-2 text-3xl font-extrabold text-gray-900">{s.value}</div>
            <div className="mt-1 text-xs text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* 整体进度 + 继续学习 */}
        <Card className="lg:col-span-1" title="整体进度" subtitle="所有课程统一计算">
          <ProgressBar value={progress.overallMastery ?? 0} showLabel label="整体掌握度" className="mt-2" />
          <div className="mt-6 space-y-2">
            {(Object.keys(STATUS_LABELS) as LearningStatus[]).map((key) => (
              <div key={key} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-600">{STATUS_LABELS[key]}</span>
                <span className="font-semibold text-gray-900">{progress.statusCounts?.[key] ?? 0}</span>
              </div>
            ))}
          </div>
          {progress.nextLesson ? (
            <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="text-xs font-semibold text-indigo-600">下一步</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{progress.nextLesson.title}</div>
              <Link
                href={("/lesson/" + progress.nextLesson.slug) as string}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                继续学习 →
              </Link>
            </div>
          ) : null}
        </Card>

        {/* 最近活动 */}
        <Card className="lg:col-span-2" title="最近活动" subtitle="最近更新的学习记录">
          {!progress.recentActivities || progress.recentActivities.length === 0 ? (
            <EmptyView
              message="还没有学习活动"
              hint="去上一节课，你的每一步都会被记录下来。"
              action={<Link href="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">去学习</Link>}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {progress.recentActivities.map((act, i) => (
                <li key={act.id ?? `${act.contentType}-${act.contentId}-${i}`} className="flex items-center gap-4 py-3.5">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${statusIconCls(act.status)}`}>
                    {statusIcon(act.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{act.label}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {typeLabel(act.contentType)} · {formatDate(act.updatedAt)} · {STATUS_LABELS[act.status] ?? act.status}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-gray-700">{act.mastery ?? 0}%</div>
                  <Link href={act.url} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-600">
                    查看
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 课程进度一览 */}
      <Card className="mt-6" title="课程进度" subtitle="每门课的完成情况">
        {!progress.courses || progress.courses.length === 0 ? (
          <EmptyView message="暂无课程" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {progress.courses.map((c) => (
              <Link key={c.slug} href={`/course/${c.slug}`} className="group rounded-xl border border-gray-100 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{c.title}</span>
                  <span className="shrink-0 text-sm font-bold text-indigo-600">{c.progress ?? 0}%</span>
                </div>
                <ProgressBar value={c.progress ?? 0} className="mt-3" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function typeLabel(t: "lesson" | "exercise" | "project"): string {
  return t === "lesson" ? "课时" : t === "exercise" ? "练习" : "项目";
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "→";
    case "needs_review":
      return "!";
    default:
      return "·";
  }
}

function statusIconCls(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-600";
    case "in_progress":
      return "bg-indigo-50 text-indigo-600";
    case "needs_review":
      return "bg-amber-50 text-amber-600";
    default:
      return "bg-gray-50 text-gray-400";
  }
}

function formatDate(value?: string): string {
  if (!value) return "时间未知";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
