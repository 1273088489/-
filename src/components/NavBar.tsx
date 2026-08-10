'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiLogout, apiMe } from "@/lib/client/api";
import type { User } from "@/types";

/**
 * 顶部导航栏：包含 Logo、主导航与登录状态区。
 * 登录状态在客户端获取（GET /api/auth/me 契约），API 未实现时视为未登录。
 */
export default function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiMe()
      .then((u) => {
        if (!cancelled) {
          setUser(Array.isArray(u) ? (u[0] ?? null) : u);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiLogout();
    } catch (err) {
      if (err instanceof ApiError === false) {
        // 忽略网络层错误，本地仍清除状态
      }
    } finally {
      localStorage.removeItem("qz_user");
      setUser(null);
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
      setLoggingOut(false);
    }
  }

  const navLinks = [
    { href: "/", label: "首页" },
    { href: "/dashboard", label: "仪表盘" },
    { href: "/choicelab", label: "选型实验" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6 sm:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-extrabold text-white">
              Q
            </span>
            <span>
              Quanzhan
              <span className="ml-1 hidden text-xs font-normal text-gray-400 sm:inline">AI 全栈项目教练</span>
            </span>
          </Link>
          <nav className="flex min-w-0 items-center gap-0 overflow-x-auto sm:gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 sm:px-3"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!checked ? (
            <span className="h-8 w-24 animate-pulse rounded-lg bg-gray-100" aria-hidden />
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {user.name ? user.name.slice(0, 1) : "用"}
                </span>
                <span className="hidden text-sm font-medium text-gray-700 md:inline">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
              >
                {loggingOut ? "退出中…" : "退出"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
              >
                登录
              </Link>
              <Link
                href="/login?mode=register"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
