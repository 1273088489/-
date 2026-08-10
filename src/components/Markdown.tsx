"use client";

import { useMemo } from "react";
import { parseMarkdown } from "@/lib/markdown";

export default function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  if (blocks.length === 0) {
    return <p className={`text-sm text-gray-500 ${className}`}>暂无正文内容。</p>;
  }

  return (
    <div className={`space-y-4 text-[15px] leading-7 text-gray-700 ${className}`}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          const cls = block.level === 1 ? "pt-2 text-2xl" : block.level === 2 ? "pt-2 text-xl" : "pt-1 text-base";
          return <Tag key={key} className={`${cls} font-bold text-gray-950`} dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />;
        }
        if (block.type === "code") {
          return (
            <pre key={key} className="overflow-x-auto rounded-xl bg-gray-950 p-4 text-sm leading-6 text-gray-100">
              <code>{block.content}</code>
            </pre>
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
