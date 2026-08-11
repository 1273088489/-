import { describe, expect, it } from "vitest";
import { MockAiProvider } from "@/server/ai/mock";

const provider = new MockAiProvider();
const project = {
  title: "测试项目",
  description: "测试描述",
  acceptanceCriteria: [],
  rubric: [{
    id: "implementation",
    criterion: "实现证据",
    weight: 100,
    evidence: ["function"],
    levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" },
  }],
};

describe("MockAiProvider.coach 提示级别", () => {
  it.each([1, 2, 3])("level %i 返回 hint 模式", async (level) => {
    const result = await provider.coach({ question: "怎么写？", level });
    expect(result.mode).toBe("hint");
    expect(result.level).toBe(level);
    expect(result.text).toContain(`提示 ${level}/3`);
    expect(result.text).toContain("先回答你自己的理解");
  });

  it("level 4（及以上）返回 solution 模式", async () => {
    const result = await provider.coach({ question: "怎么写？", level: 4 });
    expect(result.mode).toBe("solution");
    expect(result.level).toBe(4);
    expect(result.text).toContain("参考答案思路");
  });

  it("携带 context 时在回复中包含课程上下文", async () => {
    const result = await provider.coach({ question: "q", level: 1, context: "工单系统阶段 1" });
    expect(result.text).toContain("工单系统阶段 1");
  });
});

describe("MockAiProvider.review 缺陷识别", () => {
  it("发现硬编码弱密码并记为 blocker", async () => {
    const code = `const db = new Database("quanzhan.db");
const password = "hunter2";
db.exec(\`CREATE TABLE ...\`);`;
    const result = await provider.review({ code, project });
    expect(result.provider).toBe("mock");
    const blocker = result.checklist.find((c) => c.severity === "blocker");
    expect(blocker).toBeDefined();
    expect(blocker!.message).toMatch(/密码|环境变量|哈希/);
    expect(result.score).toBeLessThan(60);
  });

  it("发现 try 无 catch 并记为 suggestion（不识别为 blocker）", async () => {
    const code = `function load() {
  try {
    return JSON.parse(localStorage.getItem("tasks") ?? "[]");
  }
}
const x = 1;`;
    const result = await provider.review({ code, project });
    const suggestion = result.checklist.find((c) => c.severity === "suggestion" && /try/i.test(c.message));
    expect(suggestion).toBeDefined();
    expect(result.checklist.some((c) => c.severity === "blocker")).toBe(false);
  });

  it("代码过短时记为 nit 且不误报 blocker", async () => {
    const result = await provider.review({ code: "const a=1;", project });
    expect(result.checklist.some((c) => c.severity === "nit")).toBe(true);
    expect(result.checklist.some((c) => c.severity === "blocker")).toBe(false);
  });
});

describe("MockAiProvider.evaluateChoice 区分 rationale", () => {
  it("没有 rationale 时给低分并提示缺少理由", async () => {
    const withoutRationale = await provider.evaluateChoice({
      scenario: "选型",
      options: ["React", "Vue"],
      selectedOption: "React",
      rationale: "",
    });
    const withRationale = await provider.evaluateChoice({
      scenario: "选型",
      options: ["React", "Vue"],
      selectedOption: "React",
      rationale: "业务需要成熟组件生态，团队熟悉 React，维护成本更低。",
    });
    expect(withoutRationale.score).toBeLessThan(withRationale.score);
    expect(withoutRationale.feedback).toContain("没有说明理由");
  });

  it("有 rationale 且涉及业务/需求/团队/成本时得分更高", async () => {
    const result = await provider.evaluateChoice({
      scenario: "选型",
      options: ["React", "Vue"],
      selectedOption: "React",
      rationale: "我们业务需要组件生态，团队熟悉 React，且整体成本可控。",
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.feedback).toMatch(/需求.*团队.*成本/);
  });
});
