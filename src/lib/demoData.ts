// 本地演示数据：当某些 API 尚未由后端 agent 实现时，页面用它兜底演示，
// 保证 UI 可访问、可交互。真实运行环境一旦接上 API，将优先展示 API 数据。
import type {
  ChoiceScenario,
  ChoiceSubmissionResult,
  ExerciseDetail,
  ExerciseResult,
  ExerciseSummary,
  ProgressOverview,
  ProjectDetail,
  ReviewResult,
} from "@/types";

export interface DemoExerciseCatalog {
  exercises: Record<string, ExerciseDetail>;
}

// 课程里的练习题（slug 为键）；id 参数兜底时按 slug / 固定 key 匹配。
const demoExercises: ExerciseDetail[] = [
  {
    id: "demo-s1-ex1-git-commit",
    slug: "s1-ex1-git-commit",
    prompt: "在终端中执行 git init、git add、git commit（至少一条），然后说明这些命令各做了什么。",
    hints: ["git init 是在哪个目录执行的？", "git add 和 git commit 的顺序为什么不能颠倒？", "git status 能帮你确认什么？"],
    rubric: ["理解三个命令作用", "能说清顺序", "能说明验证方式 git status / git log"],
    answerType: "text",
    choices: [],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    lessonSlug: "s1-dev-environment",
    lessonTitle: "阶段 1：开发环境、终端与 Git",
  },
  {
    id: "demo-s2-ex1-render",
    slug: "s2-ex1-render",
    prompt: "写一个 render() 函数：从 state.tasks 渲染 <li>，并为每个任务提供“完成”和“删除”两个按钮。",
    hints: ["render 只负责把 state 变成界面，不做其他事。", "用 data-index 记录每个任务的索引，事件里读出来。", "事件委托还是逐项绑定？如何保证只触发目标项？"],
    rubric: ["能从 state 渲染", "有完成/删除按钮", "代码可运行"],
    answerType: "code",
    choices: [],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    lessonSlug: "s2-vanilla-js",
    lessonTitle: "阶段 2：用原生 JS 做一个能用的任务看板",
  },
  {
    id: "demo-choices-s3",
    slug: "s3-demo-choices",
    prompt: "下面哪个选项最准确地概括了 React 的“状态 → 界面”这一核心思想？",
    hints: ["想一想：是什么触发界面变化？", "React 以自动重渲染闻名，出发点是状态。"],
    rubric: ["理解单向数据流与状态驱动"],
    answerType: "choices",
    choices: [
      "A. 界面变化后手动更新状态",
      "B. 状态变化时 React 自动重新渲染相关界面",
      "C. React 直接操作 DOM 元素来更新页面",
      "D. 状态保存在每个 DOM 节点上",
    ],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    lessonSlug: "s3-react",
    lessonTitle: "阶段 3：用 React 重写看板",
  },
];

export const demoExerciseCatalog: DemoExerciseCatalog = {
  exercises: Object.fromEntries(demoExercises.map((e) => [e.slug, e])),
};

export function demoExercise(idOrSlug: string): ExerciseDetail | null {
  const bySlug = demoExerciseCatalog.exercises[idOrSlug];
  if (bySlug) return bySlug;
  const byId = demoExercises.find((e) => e.id === idOrSlug);
  return byId ?? null;
}

/** 为选择/文本/代码三种题型生成演示判分。 */
export function gradeDemoExercise(ex: ExerciseDetail, answer: unknown): ExerciseResult {
  const raw = typeof answer === "string" ? answer : JSON.stringify(answer);
  const text = (raw ?? "").trim();

  if (ex.answerType === "choices") {
    // 当前演示选择题的正确答案是第二项（B）。
    const selected = ex.choices.findIndex((c) => c === raw);
    const correct = selected === 1 || /^B[\.\s]/.test(text);
    return {
      correct,
      feedback: correct
        ? "回答正确！状态变化是 React 重新渲染的源动力，这就是“状态 → 界面”的核心。"
        : "再想想：React 会在“状态”发生变化时自动更新界面，而不是反向操作。",
      mastery: correct ? 100 : 20,
    };
  }

  const length = text.replace(/\s+/g, "").length;
  if (length < 8) {
    return {
      correct: false,
      feedback: "内容太短，看不出你的实现思路。请补充更多细节后再提交。",
      mastery: 10,
    };
  }
  const hasCode = /function|=>|const\s|let\s|return|\{|\}/.test(text);
  const score = Math.min(100, 40 + Math.min(length, 90) / 2 + (hasCode ? 15 : 0));
  return {
    correct: score >= 70,
    feedback:
      score >= 70
        ? "不错！你已经给出了可执行的思路。结合 rubric 再对照参考答案检查一次。"
        : "思路有基础，但还不够具体。请把代码/答案补全到能运行的程度，再参考 rubric 自查。",
    mastery: Math.round(score),
  };
}

export function demoCourseFallback(): ProgressOverview {
  return {
    overallMastery: 12,
    completedLessons: 0,
    totalLessons: 4,
    completedProjects: 0,
    totalProjects: 4,
    completedExercises: 0,
    totalExercises: 9,
    statusCounts: { not_started: 17, in_progress: 0, completed: 0, needs_review: 0 },
    courses: [
      {
        slug: "fullstack-ticket-system",
        title: "全栈工单管理系统（从零到上线）",
        description: "用一个逐步扩展的真实项目掌握完整全栈：先写原生 JS 前端，再上 React、Node/Express API、PostgreSQL、测试、CI/CD 与部署。",
        progress: 12,
      },
    ],
    recentActivities: [],
    nextLesson: {
      slug: "s1-dev-environment",
      title: "阶段 1：开发环境、终端与 Git",
      orderIndex: 0,
      requiresPass: true,
      url: "/lesson/s1-dev-environment",
    },
  };
}

export function mockReviewForProject(projectSlug: string, code: string): ReviewResult {
  const checklist = demoReviewChecks(code);
  const score = Math.max(20, 100 - checklist.length * 12);
  return {
    score,
    summary: `演示评审完成：发现 ${checklist.filter((c) => c.severity === "blocker").length} 个阻止项、${checklist.filter((c) => c.severity === "suggestion").length} 个建议、${checklist.filter((c) => c.severity === "nit").length} 个微调。项目：${projectSlug}（此结果来自本地演示判分，接上真实 API 后将由 AI 评审替代）。`,
    checklist,
    suggestions: ["补充空输入与异常输入的单元测试。", "整理代码注释，保留关键设计意图即可。"],
    provider: "demo",
  };
}

function demoReviewChecks(code: string): ReviewResult["checklist"] {
  const checks: ReviewResult["checklist"] = [];
  if (/password\s*=\s*['"]\w{1,8}['"]/i.test(code)) {
    checks.push({ severity: "blocker", message: "疑似硬编码弱密码，建议改用环境变量或哈希。", evidence: "代码中出现相关模式" });
  }
  if (/select\s+\*\s+from/i.test(code)) {
    checks.push({ severity: "suggestion", message: "使用了 SELECT *，MVP 可接受但要留意字段暴露风险。", evidence: "SQL 模式匹配" });
  }
  if (/console\.log/i.test(code)) {
    checks.push({ severity: "nit", message: "保留关键日志即可，避免遗留调试输出。", evidence: "console.log" });
  }
  if (!/\bfunction\b|\bconst\b|\blet\b/.test(code)) {
    checks.push({ severity: "suggestion", message: "未看到函数/变量声明，请确认这是完整可运行的代码。", evidence: "缺少声明" });
  }
  if (code.trim().length < 30) {
    checks.push({ severity: "nit", message: "代码较短，可能未完成全部任务，请补全后再提交。", evidence: "长度不足" });
  }
  if (checks.length === 0) {
    checks.push({ severity: "suggestion", message: "整体结构清晰，建议补充边界条件测试（空输入、异常输入）以增强健壮性。", evidence: "基础评审通过" });
  }
  return checks;
}

export function demoExerciseSummaries(): ExerciseSummary[] {
  return demoExercises.map((e) => ({
    id: e.id,
    slug: e.slug,
    prompt: e.prompt,
    answerType: e.answerType,
    status: "not_started",
    mastery: 0,
  }));
}

const demoProjects: ProjectDetail[] = [
  {
    slug: "p1-static-page",
    title: "项目 1：发布你的静态个人主页",
    description: "完成从本地页面、Git 提交到公开部署的最小闭环。",
    orderIndex: 0,
    tasks: ["创建语义化 HTML 页面", "编写响应式样式", "使用 Git 提交并部署"],
    acceptanceCriteria: ["移动端和桌面端均可正常阅读", "页面包含清晰的标题、简介和项目入口", "仓库至少包含一次有意义的提交"],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    status: "not_started",
    mastery: 0,
  },
  {
    slug: "p2-vanilla-board",
    title: "项目 2：原生 JS 任务看板",
    description: "不使用框架，实现支持本地持久化的任务看板。",
    orderIndex: 1,
    tasks: ["添加、完成和删除任务", "使用 localStorage 持久化", "处理空输入与刷新恢复"],
    acceptanceCriteria: ["刷新页面后任务仍存在", "空任务不会被创建", "操作后界面与状态保持一致"],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    status: "not_started",
    mastery: 0,
  },
  {
    slug: "p3-react-board",
    title: "项目 3：React 版任务看板",
    description: "用组件、状态提升和测试重构任务看板。",
    orderIndex: 2,
    tasks: ["拆分 Board、TaskList 与 TaskItem", "建立单向数据流", "为关键交互补充测试"],
    acceptanceCriteria: ["组件职责清晰", "状态只有一个可信来源", "关键增删改流程有自动化测试"],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    status: "not_started",
    mastery: 0,
  },
  {
    slug: "p4-fullstack-board",
    title: "项目 4：全栈工单系统",
    description: "连接 React、API 和 PostgreSQL，完成可部署的 CRUD 应用。",
    orderIndex: 3,
    tasks: ["设计工单数据模型", "实现认证与 CRUD API", "连接前端并处理错误状态", "补充测试与部署配置"],
    acceptanceCriteria: ["数据写入数据库并可查询", "未登录用户无法修改工单", "接口错误会在界面明确展示", "项目可通过自动化检查"],
    courseSlug: "fullstack-ticket-system",
    courseTitle: "全栈工单管理系统（从零到上线）",
    status: "not_started",
    mastery: 0,
  },
];

export function demoProject(slug: string): ProjectDetail | null {
  return demoProjects.find((project) => project.slug === slug) ?? null;
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
