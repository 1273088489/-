'use client';

/** 进度条：value 0-100，可自定义颜色与 label。 */
export default function ProgressBar({
  value,
  showLabel,
  className = "",
  barClassName,
  label,
}: {
  value: number;
  showLabel?: boolean;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 0));
  return (
    <div className={className} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label ?? "进度"}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ${barClassName ?? ""}`}
          style={{ width: `${v}%` }}
        />
      </div>
      {showLabel ? (
        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
          <span>{label ?? "进度"}</span>
          <span className="font-medium text-gray-700">{v}%</span>
        </div>
      ) : null}
    </div>
  );
}
