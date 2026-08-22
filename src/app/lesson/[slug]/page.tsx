"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiLesson, apiCompleteLesson } from "@/lib/client/api";
import { Card, EmptyView, ErrorView, LessonTerminal, LoadingView, Markdown } from "@/components";
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
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [completeErr, setCompleteErr] = useState<string | null>(null);
  const [tocWidth, setTocWidth] = useState<number>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("quanzhan.tocWidth") : null;
    return saved ? Math.max(128, Math.min(256, Number(saved))) : 256;
  });
  const [tocCollapsed, setTocCollapsed] = useState<boolean>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("quanzhan.tocCollapsed") : null;
    return saved === "true";
  });

  useEffect(() => { localStorage.setItem("quanzhan.tocWidth", String(tocWidth)); }, [tocWidth]);
  useEffect(() => { localStorage.setItem("quanzhan.tocCollapsed", String(tocCollapsed)); }, [tocCollapsed]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await apiLesson(slug);
      setLesson(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "课时加载失败");
      setErrorStatus(err instanceof ApiError ? err.status : null);
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
    const requiresLogin = errorStatus === 401;
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ErrorView
          message={error}
          onRetry={load}
          hint={requiresLogin ? "请先登录后再查看课时内容和学习进度。" : "课时可能不存在，或内容服务尚未就绪。"}
        />
        {requiresLogin ? (
          <div className="mt-4 text-center">
            <Link href="/login" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">
              去登录
            </Link>
          </div>
        ) : null}
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

  const contentPadding = tocCollapsed ? 0 : tocWidth;

  return (
    <div style={{ paddingLeft: contentPadding + "px" }} className="transition-[padding] duration-200">
      <SectionNavigation source={lesson.contentMarkdown} width={tocWidth} collapsed={tocCollapsed} onWidthChange={setTocWidth} onToggleCollapse={() => setTocCollapsed((v) => !v)} />
      <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <main className="min-w-0">
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
      </main>
      <aside className="min-w-0 lg:sticky lg:top-24">
        <LessonTerminal courseSlug={lesson.courseSlug} />
      </aside>
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

function SectionNavigation({ source, width, collapsed, onWidthChange, onToggleCollapse }: {
  source: string;
  width: number;
  collapsed: boolean;
  onWidthChange: (w: number) => void;
  onToggleCollapse: () => void;
}) {
  const headings = useMemo(() => {
    return parseMarkdown(source).filter((b): b is MarkdownBlock & { level: number; html: string } =>
      b.type === "heading" && b.level !== undefined && b.level >= 2 && b.level <= 3 && typeof b.html === "string"
    );
  }, [source]);

  const [activeId, setActiveId] = useState<string>("");
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

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

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      e.preventDefault();
      const delta = e.clientX - startX.current;
      const next = Math.max(128, Math.min(256, startW.current + delta));
      onWidthChange(next);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onWidthChange]);

  if (headings.length === 0) return null;

  const itemClass = (isActive: boolean, isSub: boolean) =>
    "block rounded-lg px-3 py-1.5 text-xs leading-relaxed transition " +
    (isActive ? "bg-indigo-50 font-semibold text-indigo-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900") +
    (isSub ? " pl-6" : "");

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="fixed left-0 top-24 z-10 hidden h-12 w-6 items-center justify-center rounded-r-md border border-l-0 border-gray-200 bg-white text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:flex"
          aria-label="展开目录"
        >
          &gt;&gt;
        </button>
      ) : null}

      {!collapsed ? (
        <nav className="fixed left-0 top-24 z-10 hidden h-[calc(100vh-6rem)] border-r border-gray-200 bg-white lg:block" style={{ width: width + "px" }} aria-label="章节导航">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">本课目录</p>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="收起目录"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <ul className="space-y-1">
                {headings.map((h) => {
                  const id = headingId(h.html ?? "");
                  const isActive = activeId === id;
                  const isSub = h.level === 3;
                  return (
                    <li key={id}>
                      <a
                        href={"#" + id}
                        className={itemClass(isActive, isSub)}
                      >
                        {h.html?.replace(/<[^>]*>/g, "")}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <div
            className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-indigo-400 active:bg-indigo-500"
            onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
              dragging.current = true;
              startX.current = e.clientX;
              startW.current = width;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            aria-label="调整宽度"
          />
        </nav>
      ) : null}
    </>
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
