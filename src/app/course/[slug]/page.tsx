"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiCourseDetail } from "@/lib/client/api";
import { demoCourseFallback } from "@/lib/demoData";
import { Card, EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import type { CourseDetail, LearningStatus, ProjectSummary } from "@/types";

const STATUS_META: Record<LearningStatus, { label: string; cls: string }> = {
  not_started: { label: "未开始", cls: "bg-gray-100 text-gray-500" },
  in_progress: { label: "进行中", cls: "bg-indigo-50 text-indigo-600" },
  completed: { label: "已完成", cls: "bg-emerald-50 text-emerald-600" },
  needs_review: { label: "待复习", cls: "bg-amber-50 text-amber-600" },
};

/** 课程详情页：课时列表、阶段项目列表、各自进度。 */
export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiCourseDetail(slug);
      setCourse(data);
      setUsingDemo(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "课程加载失败");
      const fallback = demoCourseFallback();
      setCourse({
        slug,
        title: fallback.courses[0]?.title ?? "课程",
        description: fallback.courses[0]?.description ?? "",
        orderIndex: 0,
        progress: 0,
        lessons: [
          { slug: "s1-dev-environment", title: "阶段 1：开发环境、终端与 Git", orderIndex: 0, requiresPass: true, status: "not_started", mastery: 0 },
          { slug: "s2-vanilla-js", title: "阶段 2：用原生 JS 做一个能用的任务看板", orderIndex: 1, requiresPass: true, status: "not_started", mastery: 0 },
          { slug: "s3-react", title: "阶段 3：用 React 重写看板", orderIndex: 2, requiresPass: true, status: "not_started", mastery: 0 },
          { slug: "s4-node-postgres", title: "阶段 4：Node/Express API + PostgreSQL 持久化", orderIndex: 3, requiresPass: true, status: "not_started", mastery: 0 },
        ],
        projects: [
          { slug: "p1-static-page", title: "项目 1：发布你的静态个人主页", description: "走通写代码→提交→上线最小闭环", orderIndex: 0, status: "not_started", mastery: 0 },
          { slug: "p2-vanilla-board", title: "项目 2：原生 JS 任务看板", description: "localStorage 持久化的任务看板", orderIndex: 1, status: "not_started", mastery: 0 },
          { slug: "p3-react-board", title: "项目 3：React 版任务看板", description: "组件化 + 状态提升 + 单测", orderIndex: 2, status: "not_started", mastery: 0 },
          { slug: "p4-fullstack-board", title: "项目 4：全栈工单系统", description: "React + Express + PostgreSQL 完整 CRUD", orderIndex: 3, status: "not_started", mastery: 0 },
        ],
      });
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <LoadingView label="正在加载课程…" />
      </div>
    );
  }

  if (error && !course) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ErrorView message={error} onRetry={load} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <EmptyView message="课程不存在" hint="请返回首页重新选择课程。" action={<Link href="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">返回首页</Link>} />
      </div>
    );
  }

  const sortedLessons = [...course.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedProjects = [...course.projects].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← 返回课程列表</Link>

      <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">实战课程</span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{course.title}</h1>
            <p className="mt-3 leading-relaxed text-gray-600">{course.description}</p>
          </div>
          <div className="w-full max-w-xs">
            <ProgressBar value={course.progress ?? 0} showLabel label="课程进度" />
            {usingDemo ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">当前展示演示数据，GET /api/course/[slug] 就绪后自动切换。</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* 课时列表 */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">课时列表</h2>
          <span className="text-sm text-gray-500">{sortedLessons.length} 节课</span>
        </div>
        {sortedLessons.length === 0 ? (
          <EmptyView message="暂无课时" hint="课程内容正在整理中。" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedLessons.map((lesson, i) => {
              const meta = STATUS_META[lesson.status ?? "not_started"] ?? STATUS_META.not_started;
              return (
                <Link key={lesson.slug} href={`/lesson/${lesson.slug}`} className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700 group-hover:bg-indigo-600 group-hover:text-white">
                      {i + 1}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-900 group-hover:text-indigo-700">{lesson.title}</h3>
                  <div className="mt-auto pt-4">
                    <ProgressBar value={lesson.mastery ?? 0} className="mt-2" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 阶段项目 */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">阶段项目</h2>
          <span className="text-sm text-gray-500">{sortedProjects.length} 个项目</span>
        </div>
        {sortedProjects.length === 0 ? (
          <EmptyView message="暂无阶段项目" hint="完成课时后，项目任务会逐步解锁。" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedProjects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const meta = STATUS_META[project.status ?? "not_started"] ?? STATUS_META.not_started;
  return (
    <Link href={`/project/${project.slug}`} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-violet-700">{project.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{project.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <ProgressBar value={project.mastery ?? 0} className="flex-1" />
        <span className="shrink-0 text-xs font-medium text-indigo-600 group-hover:underline">进入项目 →</span>
      </div>
    </Link>
  );
}
