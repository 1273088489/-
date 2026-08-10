import type { ChoiceLabInput } from "./types";

// 选型实验场景定义。覆盖：前端框架、后端语言、数据库、单体/微服务、部署方式。
// evaluateChoice 使用 options 与 selectedOption/rationale，因此每个场景都要给出候选数组。

export interface ChoiceLabScenario {
  id: string;
  title: string;
  scenario: string;
  options: string[];
}

export const choiceLabScenarios: ChoiceLabScenario[] = [
  {
    id: "frontend-framework",
    title: "前端框架选型",
    scenario:
      "你要为一家中小型电商团队搭建一个需要频繁迭代的管理后台。团队成员超过一半没有使用过现代前端框架，但熟练 HTML/CSS/原生 JS。项目交付时间紧，且未来一年内会逐步增加复杂报表和大体量交互页面。请在前端技术栈上做出选择并说明理由。",
    options: ["React", "Vue", "Svelte", "继续使用原生 JS"],
  },
  {
    id: "backend-language",
    title: "后端语言选型",
    scenario:
      "计划从零开始构建一个工单系统 API：涉及用户认证、权限、消息通知与第三方集成。团队以 JavaScript/TypeScript 为主，需要一款兼顾开发速度、类型安全与生态成熟度的后端方案。请选择后端语言/运行时并论证。",
    options: ["Node.js + TypeScript", "Python (FastAPI)", "Go", "Java (Spring Boot)"],
  },
  {
    id: "database-choice",
    title: "数据库选型",
    scenario:
      "工单系统的核心数据是结构化与强关联的：用户、工单、状态流转日志。初期只有单机部署、数据量中等（十万到百万条），但查询模式多样且需要事务保证。请选择数据库方案并说明取舍。",
    options: ["SQLite", "PostgreSQL", "MongoDB", "MySQL"],
  },
  {
    id: "monolith-vs-microservices",
    title: "架构：单体还是微服务",
    scenario:
      "一个 5 人团队要在一季度内上线并持续迭代一个 CRM 产品。当前只有几十个活跃客户，团队从未拆分过微服务，也没有专门的运维人员。请决定采用单体还是微服务架构，并论证你的取舍。",
    options: ["模块化单体（Modular Monolith）", "微服务", "先单体、后按需拆分", "无服务器函数（FaaS）"],
  },
  {
    id: "deployment-strategy",
    title: "部署方式选型",
    scenario:
      "一个预算有限、几乎没有专职运维人员的创业团队需要把全栈应用（前端 + API + 数据库）部署到生产环境，要求低成本、易回滚、能快速扩容。请选择部署方式并说明理由。",
    options: ["Vercel / 云托管平台", "自建 VPS + Docker Compose", "Kubernetes (K8s)", "静态托管 + 数据库免费层"],
  },
  {
    id: "orchestration-level",
    title: "缓存与异步任务策略",
    scenario:
      "工单系统需要发送通知、生成报表等耗时任务，且部分查询开始变慢。团队希望在不引入过多运维负担的前提下提升响应体验。请选择一种合适的补充策略并论证。",
    options: ["引入消息队列（如 Redis/队列）逐步异步化", "先加缓存，异步任务后面再说", "直接上任务调度框架全量改造", "保持同步执行，仅优化 SQL"],
  },
];

export function getChoiceLabScenarioById(id: string): ChoiceLabScenario | undefined {
  return choiceLabScenarios.find((s) => s.id === id);
}

export function toChoiceLabInput(scenario: ChoiceLabScenario, selectedOption: string, rationale: string): ChoiceLabInput {
  return {
    scenario: scenario.scenario,
    options: scenario.options,
    selectedOption,
    rationale,
  };
}
