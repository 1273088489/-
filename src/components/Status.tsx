'use client';

import type { ReactNode } from "react";

type StatusKind = "loading" | "error" | "empty";

const statusStyles: Record<StatusKind, { icon: string; title: (message: string) => string; box: string }> = {
  loading: {
    icon: "animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600",
    title: (message) => message || "加载中…",
    box: "items-center",
  },
  error: {
    icon: "rounded-full bg-red-100 text-red-600",
    title: (message) => message || "出错了",
    box: "items-center",
  },
  empty: {
    icon: "rounded-full bg-gray-100 text-gray-500",
    title: (message) => message || "暂无内容",
    box: "items-center",
  },
};

/** 统一的加载 / 错误 / 空状态展示。 */
export function StatusView({
  kind,
  message,
  hint,
  action,
  className = "",
}: {
  kind: StatusKind;
  message?: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = statusStyles[kind];
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center ${s.box} ${className}`}>
      <div className={`mx-auto h-10 w-10 ${s.icon}`}>
        {kind !== "loading" && (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold">
            {kind === "error" ? "!" : "·"}
          </span>
        )}
      </div>
      <p className="text-base font-medium text-gray-900">{s.title(message ?? "")}</p>
      {hint ? <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-500">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function LoadingView({ label = "加载中…", className }: { label?: string; className?: string }) {
  return <StatusView kind="loading" message={label} className={className} />;
}

export function ErrorView({
  message,
  onRetry,
  hint = "请稍后重试；如果持续失败，请检查后端服务是否已启动。",
  className,
}: {
  message?: string;
  onRetry?: () => void;
  hint?: string;
  className?: string;
}) {
  return (
    <StatusView
      kind="error"
      message={message}
      hint={hint}
      className={className}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            重新加载
          </button>
        ) : undefined
      }
    />
  );
}

export function EmptyView({
  message = "这里还没有内容",
  hint,
  action,
  className,
}: {
  message?: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return <StatusView kind="empty" message={message} hint={hint} action={action} className={className} />;
}
