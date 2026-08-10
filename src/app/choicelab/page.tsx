"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyView, ErrorView, LoadingView } from "@/components";
import { ApiError, apiChoiceScenarios } from "@/lib/client/api";
import { demoChoiceScenarios } from "@/lib/demoData";
import type { ChoiceScenario } from "@/types";

export default function ChoiceLabPage() {
  const [scenarios, setScenarios] = useState<ChoiceScenario[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScenarios(await apiChoiceScenarios());
      setUsingDemo(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "场景加载失败");
      setScenarios(demoChoiceScenarios);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-indigo-600">ChoiceLab</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-950">技术选型实验</h1>
          <p className="mt-3 leading-7 text-gray-600">在具体约束下做选择，写清需求、取舍、风险和迁移成本，再接受 AI 反馈。</p>
        </div>
        {usingDemo ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">演示场景</span> : null}
      </header>

      {loading ? <LoadingView className="mt-8" label="正在加载实验场景…" /> : error && (!scenarios || scenarios.length === 0) ? <ErrorView className="mt-8" message={error} onRetry={load} /> : !scenarios || scenarios.length === 0 ? <EmptyView className="mt-8" message="暂无实验场景" hint="新的技术选型题目正在准备中。" /> : (
        <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
          {scenarios.map((scenario, index) => (
            <Link key={scenario.id} href={`/choicelab/${scenario.id}`} className="group grid gap-4 py-6 transition hover:bg-gray-50 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600 group-hover:bg-indigo-600 group-hover:text-white">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-gray-950 group-hover:text-indigo-700">{scenario.title}</h2>{scenario.category ? <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">{scenario.category}</span> : null}</div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{scenario.description}</p>
                <p className="mt-3 text-xs text-gray-400">{scenario.options.length} 个候选方案</p>
              </div>
              <span className="self-center text-sm font-semibold text-indigo-600">开始实验 →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
