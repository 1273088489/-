import type { ReactNode } from "react";

/** 统一的圆角卡片容器。 */
export default function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
