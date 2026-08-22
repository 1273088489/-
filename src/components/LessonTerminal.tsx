"use client";

import { useEffect, useState } from "react";

interface LessonTerminalProps {
  courseSlug: string;
}

type TerminalStatus = "loading" | "ready" | "unavailable";

export default function LessonTerminal({ courseSlug }: LessonTerminalProps) {
  const [status, setStatus] = useState<TerminalStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const terminalUrl = "/terminal/" + encodeURIComponent(courseSlug) + "/";

  useEffect(() => {
    setStatus("loading");
  }, [courseSlug]);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-xl shadow-gray-900/10" aria-label="共享学习终端">
      <header className="border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">共享学习终端</h2>
            <p className="mt-1 truncate font-mono text-xs text-gray-400">{courseSlug}</p>
          </div>
          <span className={status === "ready" ? "shrink-0 text-xs text-emerald-300" : status === "unavailable" ? "shrink-0 text-xs text-amber-300" : "shrink-0 text-xs text-gray-400"}>
            {status === "ready" ? "已连接" : status === "unavailable" ? "暂不可用" : "连接中"}
          </span>
        </div>
      </header>
      <div className="relative h-[315px] min-h-[315px] bg-[#0b0f13]">
        <iframe
          key={reloadToken}
          title="共享学习终端"
          src={terminalUrl}
          className="h-full w-full border-0"
          referrerPolicy="same-origin"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("unavailable")}
        />
        {status === "loading" ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0b0f13]/90 text-sm text-gray-400">正在连接终端…</div> : null}
        {status === "unavailable" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0f13]/95 px-4 text-center">
            <p className="text-sm text-gray-300">终端运行环境暂不可用</p>
            <button type="button" aria-label="重新连接终端" title="重新连接终端" onClick={() => { setStatus("loading"); setReloadToken((value) => value + 1); }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-lg text-gray-300 transition hover:border-gray-500 hover:text-white">↻</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
