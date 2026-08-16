"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiProgress, apiRemediationPaths } from "@/lib/client/api";
import { Card, EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import type { CourseSummary, LearningStatus, ProgressOverview, RemediationPathRecord } from "@/types";

const STATUS_LABELS: Record<LearningStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  needs_review: "待复习",
};

const STAGE_DEFS: Array<{ id: string; title: string; short: string; color: string; desc: string }> = [
  { id: "S1", title: "第 1 阶段", short: "S1", color: "from-emerald-400 to-emerald-500", desc: "开发环境、终端与 Git" },
  { id: "S2", title: "第 2 阶段", short: "S2", color: "from-blue-400 to-blue-500", desc: "原生 JavaScript 工单看板" },
  { id: "S3", title: "第 3 阶段", short: "S3", color: "from-violet-400 to-violet-500", desc: "React 重构工单看板" },
  { id: "S4", title: "第 4 阶段", short: "S4", color: "from-rose-400 to-rose-500", desc: "Node/Express API 与 PostgreSQL" },
];

/** 学习仪表盘：整体进度、最近活动、继续学习、技能树、弱项分析、路径建议、时间线。 */
export default function DashboardPage() {
  const [progress, setProgress] = useState<ProgressOverview | null>(null);
  const [remediationPaths, setRemediationPaths] = useState<RemediationPathRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiProgress();
      setProgress(data);
      try {
        setRemediationPaths(await apiRemediationPaths());
      } catch {
        setRemediationPaths([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "进度加载失败");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 从课程进度推断阶段完成状态 */
  const stageStatuses = useMemo(() => {
    if (!progress) return STAGE_DEFS.map((s) => ({ ...s, status: "not_started" as LearningStatus, progress: 0 }));
    const masteries = progress.courses.map((c) => c.progress ?? 0);
    // 单课程场景下，按进度映射阶段状态
    const avgMastery = progress.overallMastery ?? 0;
    return STAGE_DEFS.map((s, i) => {
      const idx = i;
      // 根据课程进度推断：S1对应前25%，S2对应25-50%，S3对应50-75%，S4对应75-100%
      const stageProgress = Math.max(0, Math.min(100, avgMastery - idx * 25));
      let status: LearningStatus = "not_started";
      if (avgMastery >= (idx + 1) * 25) {
        status = "completed";
      } else if (avgMastery >= idx * 25) {
        status = "in_progress";
      }
      return { ...s, status, progress: Math.min(100, Math.max(0, stageProgress * 4)) };
    });
  }, [progress]);

  /** 弱项分析：从 statusCounts 和课程掌握度推断薄弱环节 */
  const weakSpots = useMemo(() => {
    if (!progress) return [];
    const spots: Array<{ area: string; level: "warning" | "danger"; reason: string; suggestion: string }> = [];
    const counts = progress.statusCounts ?? {};
    const reviewCount = counts.needs_review ?? 0;
    const notStarted = counts.not_started ?? 0;
    if (reviewCount > 0) {
      spots.push({
        area: "待复习内容",
        level: "warning",
        reason: `有 ${reviewCount} 项内容需要复习`,
        suggestion: "优先复习这些课时和练习，巩固薄弱知识点",
      });
    }
    if (notStarted > 2) {
      spots.push({
        area: "进度滞后",
        level: "danger",
        reason: `仍有 ${notStarted} 项内容未开始`,
        suggestion: "从下一步推荐开始，保持学习节奏",
      });
    }
    const lowCourses = (progress.courses ?? []).filter((c) => c.progress !== undefined && c.progress < 40);
    for (const c of lowCourses) {
      spots.push({
        area: c.title,
        level: "danger",
        reason: `掌握度仅 ${c.progress}%`,
        suggestion: "回顾该课程的基础知识点，完成未通过的练习",
      });
    }
    if (spots.length === 0) {
      spots.push({
        area: "整体良好",
        level: "warning",
        reason: "当前没有明显的薄弱环节",
        suggestion: "继续保持学习节奏，挑战更高难度的内容",
      });
    }
    return spots;
  }, [progress]);

  /** 学习路径建议 */
  const pathRecommendations = useMemo(() => {
    if (!progress) return [];
    const recs: Array<{ label: string; desc: string; href: string; urgent: boolean }> = [];
    if (progress.nextLesson) {
      recs.push({
        label: progress.nextLesson.title,
        desc: "继续下一课",
        href: `/lesson/${progress.nextLesson.slug}`,
        urgent: true,
      });
    }
    const counts = progress.statusCounts ?? {};
    if ((counts.needs_review ?? 0) > 0) {
      recs.push({
        label: "复习待复习内容",
        desc: "巩固薄弱环节",
        href: "/dashboard",
        urgent: false,
      });
    }
    const lowCourses = (progress.courses ?? []).filter((c) => c.progress !== undefined && c.progress < 100);
    for (const c of lowCourses.slice(0, 2)) {
      recs.push({
        label: c.title,
        desc: `当前进度 ${c.progress ?? 0}%`,
        href: `/course/${c.slug}`,
        urgent: false,
      });
    }
    if (recs.length === 0) {
      recs.push({
        label: "浏览课程",
        desc: "探索更多学习内容",
        href: "/",
        urgent: false,
      });
    }
    return recs;
  }, [progress]);

  /** 时间线：从 recentActivities 构造时间轴 */
  const timeline = useMemo(() => {
    if (!progress?.recentActivities) return [];
    return [...progress.recentActivities].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [progress]);

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

      {/* 1. 技能树 / 阶段进度 */}
      <Card className="mt-8" title="技能树" subtitle="全栈工单系统四阶段成长路径">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stageStatuses.map((stage, i) => {
            const isCompleted = stage.status === "completed";
            const isInProgress = stage.status === "in_progress";
            return (
              <div key={stage.id} className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                {/* 连接线 */}
                {i < stageStatuses.length - 1 ? (
                  <div className="absolute -right-2 top-1/2 hidden h-0.5 w-4 -translate-y-1/2 bg-gray-200 lg:block" />
                ) : null}
                {/* 状态节点 */}
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white bg-gradient-to-br ${stage.color} ${isCompleted ? "shadow-md" : isInProgress ? "ring-2 ring-offset-1" : "opacity-50"}`}>
                    {isCompleted ? "✓" : stage.short}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">{stage.title}</div>
                    <div className="text-xs text-gray-500">{stage.desc}</div>
                  </div>
                </div>
                {/* 进度条 */}
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${stage.color}`} style={{ width: `${stage.progress}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {isCompleted ? "已完成" : isInProgress ? "进行中" : "未开始"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {remediationPaths.length > 0 ? (
        <Card className="mt-8" title="个性化补课" subtitle="根据错误记录、失败测试与低分维度生成">
          <div className="space-y-3">
            {remediationPaths.map((path) => {
              const completed = path.items.filter((item) => item.completed).length;
              const active = path.status === "active";
              return (
                <div key={path.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{path.projectTitle}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{path.summary}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {active ? "进行中" : "已完成"}
                    </span>
                  </div>
                  <ProgressBar value={path.items.length === 0 ? 0 : Math.round((completed / path.items.length) * 100)} className="mt-3" />
                  <div className="mt-1 text-xs text-gray-500">完成 {completed} / {path.items.length} 项</div>
                  <Link href={`/project/${path.projectSlug}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    查看补课路径 →
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

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

      {/* 2. 弱项分析 */}
      <Card className="mt-6" title="弱项分析" subtitle="基于进度与错误记录识别薄弱环节">
        <div className="space-y-3">
          {weakSpots.map((spot, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl p-3.5 ${spot.level === "danger" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"}`}>
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${spot.level === "danger" ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-700"}`}>
                {spot.level === "danger" ? "!" : "?"}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{spot.area}</div>
                <div className="mt-0.5 text-xs text-gray-600">{spot.reason}</div>
                <div className="mt-1 text-xs text-indigo-600">{spot.suggestion}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. 学习路径建议 */}
      <Card className="mt-6" title="学习路径建议" subtitle="根据当前进度推荐的下一步">
        <div className="grid gap-3 sm:grid-cols-2">
          {pathRecommendations.map((rec, i) => (
            <Link
              key={i}
              href={rec.href}
              className={`flex items-center gap-3 rounded-xl border p-4 transition ${rec.urgent ? "border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100" : "border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rec.urgent ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                {rec.urgent ? "→" : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">{rec.label}</div>
                <div className="mt-0.5 text-xs text-gray-500">{rec.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* 4. 学习时间线 */}
      <Card className="mt-6" title="学习时间线" subtitle="近期学习活动记录">
        {timeline.length === 0 ? (
          <EmptyView message="暂无活动记录" hint="开始学习后，活动时间线会自动生成。" />
        ) : (
          <div className="relative">
            {/* 时间轴竖线 */}
            <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200" />
            <div className="space-y-0">
              {timeline.map((act, i) => {
                const dateStr = formatDate(act.updatedAt);
                const isToday = act.updatedAt && isSameDay(new Date(act.updatedAt), new Date());
                return (
                  <div key={act.id ?? `tl-${i}`} className="relative flex items-start gap-4 pb-5 pl-10">
                    {/* 时间轴节点 */}
                    <div className={`absolute left-2.5 top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${isToday ? "bg-indigo-500" : statusIconCls(act.status).split(" ")[0]}`} />
                    <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">{act.label}</span>
                        <span className="shrink-0 text-xs text-gray-400">{dateStr}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${statusBadgeCls(act.status)}`}>
                          {STATUS_LABELS[act.status] ?? act.status}
                        </span>
                        <span>{typeLabel(act.contentType)}</span>
                        <span className="font-semibold text-gray-700">{act.mastery ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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

function statusBadgeCls(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "in_progress":
      return "bg-indigo-100 text-indigo-700";
    case "needs_review":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

function formatDate(value?: string): string {
  if (!value) return "时间未知";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
