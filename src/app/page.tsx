"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { ApiError, apiCourses } from "@/lib/client/api";
import { demoCourseFallback } from "@/lib/demoData";
import { Card, EmptyView, ErrorView, LoadingView, ProgressBar } from "@/components";
import type { CourseSummary } from "@/types";

/** 落地页：产品介绍 + 课程概览。 */
export default function HomePage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCourses();
      if (Array.isArray(data) && data.length > 0) {
        setCourses(data);
      } else {
        setCourses([]);
      }
      setUsingDemo(false);
    } catch (err) {
      // 课程 API 尚未实现时，使用本地演示数据保证页面可访问。
      setError(err instanceof ApiError ? err.message : "课程加载失败");
      setCourses(demoCourseFallback().courses);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      {/* Hero */}
      <section className="py-16 text-center sm:py-24">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
          </span>
          AI 驱动的全栈学习路径
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Quanzhan <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">· AI 全栈项目教练</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
          从一个空的“工单管理系统”开始，一步步成长为 React + API + PostgreSQL + 测试 + CI/CD 的完整全栈项目。
          AI 在学习、做题、代码审查与选型决策处提供分级反馈。
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-xl bg-indigo-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700"
          >
            开始学习 →
          </Link>
          <Link
            href="/login?mode=register"
            className="rounded-xl border border-gray-300 bg-white px-7 py-3 text-base font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            登录 / 注册
          </Link>
        </div>
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { k: "4", v: "个实战阶段" },
            { k: "15", v: "道练习题" },
            { k: "4", v: "个阶段项目" },
            { k: "24/7", v: "AI 教练陪伴" },
          ].map((item) => (
            <div key={item.v} className="rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm">
              <div className="text-2xl font-extrabold text-indigo-600">{item.k}</div>
              <div className="mt-1 text-sm text-gray-500">{item.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 课程概览 */}
      <section className="mt-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">课程概览</h2>
            <p className="mt-1 text-sm text-gray-500">按顺序学习，每个阶段都要求先做技术选型并记录 ADR。</p>
          </div>
        </div>

        {loading ? (
          <LoadingView label="正在加载课程…" />
        ) : error && (!courses || courses.length === 0) ? (
          <ErrorView message={error} onRetry={load} />
        ) : courses && courses.length === 0 ? (
          <EmptyView message="暂无课程" hint="课程内容尚未发布，请稍后再来。" />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {courses?.map((course) => (
              <Card key={course.slug} className="flex flex-col p-6 transition hover:border-indigo-200 hover:shadow-md">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    {course.lessonCount != null ? `${course.lessonCount} 节课` : "实战课程"}
                  </span>
                  {course.projectCount != null ? (
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                      {course.projectCount} 个项目
                    </span>
                  ) : null}
                </div>
                <a href={`/course/${course.slug}`} className="group">
                  <h3 className="text-lg font-bold text-gray-900 transition group-hover:text-indigo-600">{course.title}</h3>
                </a>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{course.description}</p>
                <div className="mt-5">
                  <ProgressBar value={course.progress ?? 0} showLabel label="课程进度" />
                </div>
                <a
                  href={`/course/${course.slug}`}
                  className="mt-5 inline-flex items-center justify-center rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  进入课程 →
                </a>
              </Card>
            ))}
          </div>
        )}
        {usingDemo ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前展示课程预览；登录后会自动显示你的真实学习进度。
          </p>
        ) : null}
      </section>
    </div>
  );
}
