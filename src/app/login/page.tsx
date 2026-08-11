"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ApiError, apiLogin, apiRegister } from "@/lib/client/api";

type Mode = "login" | "register";

/** 登录/注册切换表单（用 Suspense 包裹以兼容 useSearchParams）。 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError("请填写邮箱和密码。");
      return;
    }
    if (mode === "register") {
      if (!name.trim()) {
        setError("请填写昵称。");
        return;
      }
      if (password.length < 6) {
        setError("密码至少 6 位。");
        return;
      }
      if (password !== confirm) {
        setError("两次输入的密码不一致。");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        const session = await apiLogin({ email: email.trim(), password });
        if (session.user) localStorage.setItem("qz_user", JSON.stringify(session.user));
      } else {
        const session = await apiRegister({ email: email.trim(), name: name.trim(), password });
        if (session.user) localStorage.setItem("qz_user", JSON.stringify(session.user));
      }
      window.dispatchEvent(new Event("qz:auth-changed"));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${mode === "login" ? "登录" : "注册"}失败：${err.message}`);
        if (mode === "login" && err.status === 404) {
          setNotice("未检测到认证服务（POST /api/auth/login 尚未就绪）。你可以先任选一个站内页面体验演示数据，或稍后再试。");
        }
      } else {
        setError("发生未知错误，请稍后重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-extrabold text-white">
          Q
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{mode === "login" ? "欢迎回来" : "创建你的学习账号"}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {mode === "login" ? "登录后同步学习进度与练习记录。" : "注册后即可开始完整全栈学习之旅。"}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        {/* 切换 */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {notice ? (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">{notice}</div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" ? (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
                昵称
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的昵称"
                className={inputCls}
                autoComplete="name"
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "至少 6 位" : "输入密码"}
              className={inputCls}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
            />
          </div>
          {mode === "register" ? (
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">
                确认密码
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入密码"
                className={inputCls}
                autoComplete="new-password"
                required
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "请稍候…" : mode === "login" ? "登录" : "创建账号"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          {mode === "login" ? (
            <>
              还没有账号？
              <button type="button" onClick={() => switchMode("register")} className="font-medium text-indigo-600 hover:text-indigo-700">
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账号？
              <button type="button" onClick={() => switchMode("login")} className="font-medium text-indigo-600 hover:text-indigo-700">
                直接登录
              </button>
            </>
          )}
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        返回 <Link href="/" className="text-gray-500 underline-offset-2 hover:underline">首页</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-md items-center justify-center px-4 py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
