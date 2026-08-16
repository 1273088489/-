"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiLesson, apiCompleteLesson } from "@/lib/client/api";
import { Card, EmptyView, ErrorView, LoadingView, Markdown } from "@/components";
import { parseMarkdown } from "@/lib/markdown";
import type { MarkdownBlock } from "@/lib/markdown";
import type { LessonDetail } from "@/types";

/** 课时页：渲染 markdown + 练习列表 + 完成按钮。 */
export default function LessonPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [completeErr, setCompleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiLesson(slug);
      setLesson(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "课时加载失败");
      setLesson(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComplete() {
    if (!lesson) return;
    setCompleting(true);
    setCompleteErr(null);
    setCompleteMsg(null);
    try {
      await apiCompleteLesson(lesson.slug, 100);
      setCompleted(true);
      setCompleteMsg("本课时已标记为完成，掌握度 100%。");
    } catch (err) {
      if (err instanceof ApiError) {
        setCompleteErr(`请求失败：${err.message}`);
      } else {
        setCompleteErr("发生未知错误，请稍后重试。");
      }
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <LoadingView label="正在加载课时…" />
      </div>
    );
  }

  if (error && !lesson) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ErrorView message={error} onRetry={load} hint="课时可能不存在，或内容服务尚未就绪。" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <EmptyView message="课时不存在" action={<Link href="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">返回首页</Link>} />
      </div>
    );
  }

  return (
    <div className="lg:pl-64">
      <SectionNavigation source={lesson.contentMarkdown} />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/course/${lesson.courseSlug ?? "#"}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          ← {lesson.courseTitle ?? "返回课程"}
        </Link>
      </div>

      <div className="mt-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            第 {lesson.orderIndex + 1} 讲 · {lesson.requiresPass ? "必修" : "选学"} · 掌握度 {lesson.mastery ?? 0}%
          </p>
          <div className="mt-6">
            <MarkdownWithTOC source={lesson.contentMarkdown} />
          </div>
        </div>
      </div>

      {/* 练习列表 */}
      <div className="mt-10">
        <h2 className="text-xl font-bold text-gray-900">本节练习</h2>
        {!lesson.exercises || lesson.exercises.length === 0 ? (
          <EmptyView className="mt-4" message="本节暂无练习" hint="完成课时阅读后即可进入下一课。" />
        ) : (
          <div className="mt-4 grid gap-4">
            {lesson.exercises.map((ex, i) => (
              <Card key={ex.id ?? ex.slug} className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-relaxed text-gray-800">{ex.prompt}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>{answerTypeLabel(ex.answerType)}</span>
                    <span>掌握度 {ex.mastery ?? 0}%</span>
                  </div>
                </div>
                <Link
                  href={`/exercise/${ex.id ?? ex.slug}`}
                  className="shrink-0 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  去做练习 →
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 完成课时 */}
      <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">完成本课时</h2>
            <p className="mt-1 text-sm text-gray-500">确认你已经读完内容并做完练习，再标记完成。</p>
          </div>
          <button
            type="button"
            onClick={handleComplete}
            disabled={completing || completed}
            className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              completed ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {completing ? "提交中…" : completed ? "已完成 ✓" : "标记完成"}
          </button>
        </div>
        {completeMsg ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{completeMsg}</p> : null}
        {completeErr ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{completeErr}</p> : null}
      </div>

      {/* 前后课时 */}
      <div className="mt-8 flex items-center justify-between gap-4">
        {lesson.prevLessonSlug ? (
          <Link href={`/lesson/${lesson.prevLessonSlug}`} className="text-sm text-gray-500 hover:text-indigo-600">
            ← 上一讲
          </Link>
        ) : (
          <span />
        )}
        {lesson.nextLessonSlug ? (
          <Link href={`/lesson/${lesson.nextLessonSlug}`} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-indigo-300 hover:text-indigo-600">
            下一讲 →
          </Link>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function answerTypeLabel(t: string): string {
  switch (t) {
    case "choices":
      return "选择题";
    case "code":
      return "代码题";
    case "text":
      return "文本题";
    default:
      return "练习";
  }
}

function headingId(text: string): string {
  return "section-" + text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "");
}

function SectionNavigation({ source }: { source: string }) {
  const headings = useMemo(() => {
    return parseMarkdown(source).filter((b): b is MarkdownBlock & { level: number; html: string } =>
      b.type === "heading" && b.level !== undefined && b.level >= 2 && b.level <= 3 && typeof b.html === "string"
    );
  }, [source]);

  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const ids = headings.map((h) => headingId(h.html ?? ""));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="fixed left-0 top-24 z-10 hidden h-[calc(100vh-6rem)] w-64 border-r border-gray-200 bg-white lg:block" aria-label="章节导航">
      <div className="h-full overflow-y-auto p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">本课目录</p>
        <ul className="space-y-1">
          {headings.map((h) => {
            const id = headingId(h.html ?? "");
            const isActive = activeId === id;
            const isSub = h.level === 3;
            return (
              <li key={id}>
                <a
                  href={"#" + id}
                  className={`block rounded-lg px-3 py-1.5 text-xs leading-relaxed transition ${
                    isActive
                      ? "bg-indigo-50 font-semibold text-indigo-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  } ${isSub ? "pl-6" : ""}`}
                >
                  {h.html?.replace(/<[^>]*>/g, "")}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function MarkdownWithTOC({ source, className = "" }: { source: string; className?: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  if (blocks.length === 0) {
    return <p className="text-sm text-gray-500">暂无正文内容。</p>;
  }

  return (
    <div ref={contentRef} className={`space-y-4 text-[15px] leading-7 text-gray-700 ${className}`}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading" && block.level && block.level >= 2) {
          const id = headingId(block.html ?? "");
          const Tag = block.level === 2 ? "h2" : "h3";
          const cls = block.level === 2 ? "pt-2 text-2xl" : "pt-1 text-xl";
          return <Tag key={key} id={id} className={`${cls} font-bold text-gray-950 scroll-mt-24`} dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />;
        }
        if (block.type === "heading" && block.level && block.level >= 4) {
          const id = headingId(block.html ?? "");
          return <h4 key={key} id={id} className="scroll-mt-24 pt-1 text-base font-bold text-gray-950" dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />;
        }
        if (block.type === "code") {
          return (
            <div key={key} className="relative">
              <button type="button" onClick={() => void navigator.clipboard.writeText(block.content ?? "")} className="absolute right-2 top-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-200 hover:bg-gray-800" aria-label="复制代码">复制</button>
              <pre className="overflow-x-auto rounded-xl bg-gray-950 p-4 pr-20 text-sm leading-6 text-gray-100"><code>{block.content}</code></pre>
            </div>
          );
        }
        if (block.type === "list") {
          const items = (block.html ?? "").split("\u0001").filter(Boolean);
          const List = block.content === "ol" ? "ol" : "ul";
          return (
            <List key={key} className={`${block.content === "ol" ? "list-decimal" : "list-disc"} space-y-1 pl-6 marker:text-indigo-500`}>
              {items.map((item, itemIndex) => <li key={itemIndex} dangerouslySetInnerHTML={{ __html: item }} />)}
            </List>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={key} className="border-l-4 border-indigo-300 bg-indigo-50/60 px-4 py-3 text-gray-700" dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />;
        }
        if (block.type === "hr") return <hr key={key} className="border-gray-200" />;
        return <p key={key} dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />;
      })}
    </div>
  );
}
