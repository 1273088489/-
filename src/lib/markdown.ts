// 轻量 Markdown 渲染器：不引入重型依赖，覆盖课程内容里使用的常见语法。
// 支持：#/## 标题、**加粗**、`行内代码`、``` 代码块、- 列表、> 引用。
// 注意：本文件仅在客户端使用（`"use client"` 由调用方/组件保证）。

interface InlineResult {
  html: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 处理行内语法：反引号代码与 **加粗**。 */
function renderInline(text: string): string {
  // 先把代码段保护起来，避免加粗/转义破坏代码。
  const segments = text.split(/`([^`]+)`/);
  // segments 的偶数下标是普通文本，奇数下标是代码。
  const out = segments.map((seg, i) => {
    if (i % 2 === 1) return `<code class="qx-code-inline">${escapeHtml(seg)}</code>`;
    let html = escapeHtml(seg);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return html;
  });
  return out.join("");
}

export interface MarkdownBlock {
  type: "heading" | "list" | "quote" | "paragraph" | "code" | "hr";
  level?: number;
  content?: string;
  html?: string;
}

/** 把 markdown 源码解析为块列表（每次渲染都会重新解析，简单可靠）。 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  const pushPlain = (type: "paragraph" | "quote", raw: string) => {
    blocks.push({ type, html: renderInline(raw.trim()) });
  };

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 代码块 ```lang ... ```
    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束符
      blocks.push({ type: "code", content: buf.join("\n") });
      continue;
    }

    // 分隔线
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, html: renderInline(heading[2]) });
      i++;
      continue;
    }

    // 列表（- + * 或数字.）
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      while (i < lines.length) {
        const cur = lines[i];
        if (/^\s*[-*+]\s+/.test(cur) || /^\s*\d+[.)]\s+/.test(cur)) {
          items.push(cur.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
          i++;
        } else if (cur.trim() === "") {
          i++;
          break;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", content: ordered ? "ol" : "ul", html: items.map((it) => renderInline(it)).join("\u0001") });
      continue;
    }

    // 引用
    if (line.trimStart().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      pushPlain("quote", buf.join("\n"));
      continue;
    }

    // 普通段落（累积到空行或下一个块起始）
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">")
    ) {
      buf.push(lines[i]);
      i++;
    }
    pushPlain("paragraph", buf.join(" "));
  }

  return blocks;
}
