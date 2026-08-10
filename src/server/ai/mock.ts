import type { AiProvider, CoachParams, CoachResult, ReviewInput, ReviewResult, ChoiceLabInput, ChoiceLabResult } from "./types";

/**
 * Mock AiProvider — 规则化本地回复，保证无 API key 时全功能可运行、可演示、可测试。
 * 提供真实的启发式判断：评分来自关键词/长度启发，反馈是结构化、可解释的。
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async coach(params: CoachParams): Promise<CoachResult> {
    const { question, level, context } = params;
    const base =
      context ? `(课程上下文：${context})\n` : "";
    if (level >= 4) {
      return {
        text: `${base}这是参考答案思路：\n1. 先明确输入与输出；\n2. 拆成小函数；\n3. 用测试验证每个小函数；\n4. 最后用你写的代码替换示例。\n试着把你现在的实现和这个思路对一下，说出差异。`,
        level,
        mode: "solution",
      };
    }
    const hints: Record<number, string> = {
      1: "先别写代码，复述一下：你希望这段代码完成什么？当前卡在哪一步？",
      2: "想一想：哪个输入可能让你现在的实现出错？先为它写一个最小测试。",
      3: "把问题拆小：先写一个只处理单条数据的函数，再考虑循环/批量。",
    };
    return {
      text: `${base}提示 ${level}/3：${hints[level] ?? hints[1]}\n（关于“${question}”，先回答你自己的理解，再继续。）`,
      level,
      mode: "hint",
    };
  }

  async review(input: ReviewInput): Promise<ReviewResult> {
    const code = input.code ?? "";
    const checklist: ReviewResult["checklist"] = [];
    let score = 60;
    const suggestions: string[] = [];

    const blockers: Array<[RegExp, string]> = [
      [/password\s*=\s*['"][^'"]{0,8}['"]/i, "疑似硬编码弱密码，建议改用环境变量或哈希。"],
      [/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, "代码中疑似硬编码 API Key，应立即移除并放入环境变量。"],
      [/select\s+\*\s+from/i, "使用了 SELECT *，MVP 可接受但要留意字段暴露风险。"],
      [/new\s+Function|eval\s*\(/i, "使用了 eval/Function，存在执行任意代码风险，应避免。"],
    ];
    for (const [re, msg] of blockers) {
      if (re.test(code)) {
        checklist.push({ severity: "blocker", message: msg, evidence: "代码中出现相关模式" });
        score = Math.max(0, score - 15);
      }
    }

    if (/console\.log/i.test(code)) suggestions.push("保留关键日志即可，避免遗留调试输出。");
    if (/try\s*\{/.test(code) && !/catch/i.test(code)) {
      checklist.push({ severity: "suggestion", message: "try 块应配套 catch，否则错误会静默丢失。", evidence: "try 后未见 catch" });
      score = Math.max(0, score - 8);
    }
    if (!/\bfunction\b|\bconst\b|\blet\b/.test(code)) {
      checklist.push({ severity: "suggestion", message: "未看到函数/变量声明，请确认这是完整可运行的代码。", evidence: "缺少声明" });
      score = Math.max(0, score - 10);
    }
    if (code.trim().length < 30) {
      checklist.push({ severity: "nit", message: "代码较短，可能未完成全部任务，请补全后再提交。", evidence: "长度不足" });
      score = Math.max(0, score - 5);
    }

    if (score === 60 && checklist.length === 0) {
      checklist.push({ severity: "suggestion", message: "整体结构清晰，建议补充边界条件测试（空输入、异常输入）以增强健壮性。", evidence: "基础评审通过" });
      score = 85;
      suggestions.push("补充空输入与异常输入的单元测试。");
    }

    const summary = `Mock 评审完成：发现 ${checklist.filter((c) => c.severity === "blocker").length} 个阻止项、${checklist.filter((c) => c.severity === "suggestion").length} 个建议、${checklist.filter((c) => c.severity === "nit").length} 个微调。${input.taskDescription ? `（任务：${input.taskDescription}）` : ""}`;
    return { score, summary, checklist, suggestions, provider: this.name };
  }

  async evaluateChoice(input: ChoiceLabInput): Promise<ChoiceLabResult> {
    const { options, selectedOption } = input;
    let rationale = input.rationale || "";
    let score = 50;
    const feedback: string[] = [];
    rationale = rationale || "";
    if (!rationale) {
      feedback.push("你没有说明理由。选型最重要的不是选什么，而是为什么。");
      score = 20;
    } else if (rationale.includes("业务") || rationale.includes("需求") || rationale.includes("团队") || rationale.includes("成本")) {
      feedback.push("你的理由提到了需求/团队/成本等约束，方向正确。");
      score += 25;
    } else {
      feedback.push("理由偏泛，建议从需求、团队经验、维护成本、迁移风险四方面具体论证。");
      score += 10;
    }
    if (!selectedOption && options.length) {
      feedback.push("你还没有选择具体方案。");
      score = Math.min(score, 30);
    } else {
      feedback.push(`你选择了「${selectedOption}」。请用两句话说明它比其它候选（${options.join(" / ")}）在该场景下的优势与代价。`);
      if (options.length && options[0] === selectedOption) score += 15;
    }
    const final = Math.min(100, Math.max(0, score));
    feedback.push(`本场景评分：${final}/100。评分取决于论证质量而非是否命中“标准答案”。`);
    return { score: final, feedback: feedback.join("\n") };
  }
}
