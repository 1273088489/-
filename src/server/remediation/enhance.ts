// P2-06 AI 增强解释：在规则引擎摘要基础上，调用现有 AI 适配层（coach）生成学习顺序建议。
// 约定：AI 只做“解释增强”，不改变补课项本身；任何 AI 失败都回退到规则摘要，绝不抛错。
import type { StoredRemediationItem } from "./types";
import type { AiProvider } from "@/server/ai";

export interface EnhancePathExplanationOptions {
  /** 规则引擎摘要（兜底文本）。 */
  base: string;
  items: StoredRemediationItem[];
  /** 可注入 provider（测试）；缺省取全局 AI provider。 */
  provider?: Pick<AiProvider, "coach">;
}

/** 生成 AI 增强解释（best-effort）。 */
export async function enhancePathExplanation(options: EnhancePathExplanationOptions): Promise<string> {
  const { base, items } = options;
  if (items.length === 0) return base;

  const titles = items.map((item) => item.title).join("、");
  let provider = options.provider;
  if (!provider) {
    try {
      // 动态引入避免顶层循环依赖（ai/index 不依赖 remediation）。
      const { getAiProvider } = await import("@/server/ai");
      provider = getAiProvider();
    } catch {
      return base;
    }
  }

  try {
    const result = await provider.coach({
      question: `请为下面的补课学习顺序给出建议：${titles}`,
      level: 2,
      context: base,
    });
    const suggestion = result?.text?.trim();
    if (!suggestion) return base;
    return `${base}\n\n**AI 学习建议**：${suggestion}`;
  } catch {
    return base;
  }
}
