"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiAiCoach } from "@/lib/client/api";
import Markdown from "@/components/Markdown";

type Message = {
  role: "user" | "assistant";
  content: string;
  id: string;
};

type Position = { x: number; y: number };

const CHAT_KEY = "quanzhan.aiAssistant.chat";
const POS_KEY = "quanzhan.aiAssistant.position";

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
  } catch {
    // quota exceeded
  }
}

function loadPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as Position) : null;
  } catch {
    return null;
  }
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function inferContext(): string | undefined {
  const path = window.location.pathname;
  if (path === "/") return undefined;
  if (path.startsWith("/course/")) return `页面：课程详情`;
  if (path.startsWith("/lesson/")) return `页面：课时学习`;
  if (path.startsWith("/exercise/")) return `页面：练习`;
  if (path.startsWith("/project/")) return `页面：项目`;
  if (path.startsWith("/dashboard")) return `页面：仪表盘`;
  if (path.startsWith("/choicelab")) return `页面：选型实验`;
  return `页面：${path}`;
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<2 | 4>(2);
  const [position, setPosition] = useState<Position>(() => loadPosition() ?? { x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);

  // Track viewport for SSR-safe responsive layout
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Load messages on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setMessages(loadMessages());
    }
  }, []);

  // Save messages on change
  useEffect(() => {
    if (initialized.current) {
      saveMessages(messages);
    }
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);

    const userMsg: Message = { role: "user", content: text, id: Date.now().toString() + "-u" };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await apiAiCoach({
        question: text,
        level,
        context: inferContext(),
      });
      const assistantMsg: Message = {
        role: "assistant",
        content: result.response,
        id: Date.now().toString() + "-a",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "请先登录后使用 AI 助手。"
          : err instanceof Error
            ? err.message
            : "请求失败，请稍后重试。";
      setError(msg);
      const errorMsg: Message = {
        role: "assistant",
        content: `⚠️ 请求失败：${msg}`,
        id: Date.now().toString() + "-e",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, level]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
    localStorage.removeItem(CHAT_KEY);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!open) return;
      e.preventDefault();
      setDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y,
      };
    },
    [open, position],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newPos = { x: dragRef.current.origX + dx, y: dragRef.current.origY + dy };
      setPosition(newPos);
    };
    const handleUp = () => {
      setDragging(false);
      savePosition(position);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, position]);

  // Inline SVG icons
  const messageCircleIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );

  const xIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );

  const sendIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );

  const loaderIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );

  const trashIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );

  const dragHandleIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
      <circle cx="9" cy="9" r="1" /><circle cx="9" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="15" cy="15" r="1" />
    </svg>
  );

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 active:scale-95"
        aria-label={open ? "关闭AI助手" : "打开AI助手"}
      >
        {open ? xIcon : messageCircleIcon}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-200"
          style={isMobile
            ? { width: "100vw", height: "100vh", inset: 0, borderRadius: 0 }
            : {
                width: "360px",
                height: "560px",
                right: `calc(24px + ${position.x}px)`,
                bottom: `calc(90px + ${position.y}px)`,
                transform: "none",
              }}
        >
          {/* Header */}
          <div
            className="flex cursor-grab items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3"
            onMouseDown={handleDragStart}
          >
            <div className="flex items-center gap-2">
              {dragHandleIcon}
              <span className="text-sm font-semibold text-gray-800">AI 学习教练</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="mr-1 flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
                <button
                  type="button"
                  onClick={() => setLevel(2)}
                  className={`px-2 py-1 font-medium ${level === 2 ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  提示
                </button>
                <button
                  type="button"
                  onClick={() => setLevel(4)}
                  className={`px-2 py-1 font-medium ${level === 4 ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  答案
                </button>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                title="清空对话"
              >
                {trashIcon}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                aria-label="关闭"
              >
                {xIcon}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !loading && (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-sm text-gray-400">
                  问一个关于当前课程或练习的问题
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-code:rounded prose-code:bg-gray-200 prose-code:px-1 prose-code:text-xs">
                      <Markdown source={msg.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
                  {loaderIcon}
                  <span>思考中…</span>
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="flex justify-center">
                <p className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的问题…"
                rows={2}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="发送"
              >
                {sendIcon}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
