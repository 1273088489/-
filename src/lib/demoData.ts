// 无账号首页摘要与选型实验数据；课程教学正文只来自服务端 canonical 定义。
import type {
  ChoiceScenario,
  ChoiceSubmissionResult,
  ProgressOverview,
} from "@/types";

export function demoCourseFallback(): ProgressOverview {
  return {
    overallMastery: 0,
    completedLessons: 0,
    totalLessons: 7,
    completedProjects: 0,
    totalProjects: 4,
    completedExercises: 0,
    totalExercises: 15,
    statusCounts: { not_started: 26, in_progress: 0, completed: 0, needs_review: 0 },
    courses: [
      {
        slug: "fullstack-ticket-system",
        title: "全栈工单管理系统（从零到上线）",
        description: "用一个逐步扩展的真实项目掌握完整全栈：先写原生 JS 前端，再上 React、Node/Express API、PostgreSQL、测试、CI/CD 与部署。",
        progress: 0,
      },
    ],
    recentActivities: [],
    nextLesson: {
      slug: "s1-dev-environment",
      title: "第 1 阶段课时：开发环境、终端与 Git",
      orderIndex: 0,
      requiresPass: true,
      url: "/lesson/s1-dev-environment",
    },
  };
}

export const demoChoiceScenarios: ChoiceScenario[] = [
  { id: "frontend-framework", title: "前端框架选型", category: "前端", description: "中小团队要快速交付并持续扩展复杂管理后台，应选择哪种前端方案？", options: ["React", "Vue", "Svelte", "继续使用原生 JS"] },
  { id: "backend-language", title: "后端语言选型", category: "后端", description: "TypeScript 团队从零构建带认证、通知和第三方集成的工单 API。", options: ["Node.js + TypeScript", "Python (FastAPI)", "Go", "Java (Spring Boot)"] },
  { id: "database-choice", title: "数据库选型", category: "数据", description: "结构化、强关联并需要事务保证的工单系统核心数据应存在哪里？", options: ["SQLite", "PostgreSQL", "MongoDB", "MySQL"] },
  { id: "monolith-vs-microservices", title: "单体还是微服务", category: "架构", description: "5 人团队要在一个季度上线 CRM，尚无微服务和专职运维经验。", options: ["模块化单体", "微服务", "先单体、后按需拆分", "无服务器函数"] },
  { id: "deployment-strategy", title: "部署方式选型", category: "部署", description: "预算有限且没有专职运维的团队需要低成本、易回滚地部署全栈应用。", options: ["云托管平台", "VPS + Docker Compose", "Kubernetes", "静态托管 + 数据库免费层"] },
];

export function demoChoiceScenario(id: string): ChoiceScenario | null {
  return demoChoiceScenarios.find((scenario) => scenario.id === id) ?? null;
}

export function evaluateDemoChoice(rationale: string): ChoiceSubmissionResult {
  const length = rationale.trim().length;
  const score = Math.min(92, Math.max(35, 35 + Math.round(length / 4)));
  return {
    score,
    feedback: length >= 80
      ? "论证已经覆盖了需求与取舍。下一步补充迁移成本和失败后的回退方案，会更接近一份完整 ADR。"
      : "选择本身只是起点。请进一步说明需求约束、放弃其他方案的原因、主要风险和迁移成本。",
  };
}
