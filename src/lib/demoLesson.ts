// 课时页的兜底演示内容（API 未实现时展示）。
import type { LessonDetail } from "@/types";
import { demoExerciseCatalog, demoExerciseSummaries } from "@/lib/demoData";

const COURSE_TITLE = "全栈工单管理系统（从零到上线）";
const COURSE_SLUG = "fullstack-ticket-system";

const f1 = "阶段 1：开发环境、终端与 Git";
const f2 = "阶段 2：用原生 JS 做一个能用的任务看板";
const f3 = "阶段 3：用 React 重写看板";
const f4 = "阶段 4：Node/Express API + PostgreSQL 持久化";

const content: Record<string, LessonDetail> = {
  "s1-dev-environment": {
    id: "demo-s1", slug: "s1-dev-environment", title: f1, orderIndex: 0, requiresPass: true,
    contentMarkdown: `# 阶段 1：开发环境、终端与 Git

工单管理系统的第一站，先解决“环境”问题。

## 1. 终端是开发者的方向盘

- **工作目录**：\`pwd\` 显示当前目录；\`ls\` 列出文件；\`cd\` 切换目录。
- **创建文件**：\`touch app.js\`；**查看文件**：\`cat app.js\`。
- **环境变量**：\`echo $PATH\`、\`export FOO=bar\`。

## 2. Git：后悔药与时光机

- \`git init\`：把目录变成仓库。
- \`git add <file>\`：把改动放进暂存区。
- \`git commit -m "说明"\`：提交一个版本。
- \`git log --oneline\`：查看提交历史。

> 练习：提交你的第一个 commit，并在评论区用一句话说明你执行了哪些命令。`,
    courseSlug: COURSE_SLUG, courseTitle: COURSE_TITLE, status: "not_started", mastery: 0,
    exercises: [demoExerciseCatalog.exercises["s1-ex1-git-commit"], demoExerciseCatalog.exercises["s1-ex2-path"]].filter(Boolean).map((e) => ({ id: e.id, slug: e.slug, prompt: e.prompt, answerType: e.answerType, status: "not_started", mastery: 0 })),
    nextLessonSlug: "s2-vanilla-js", prevLessonSlug: null,
  },
  "s2-vanilla-js": {
    id: "demo-s2", slug: "s2-vanilla-js", title: f2, orderIndex: 1, requiresPass: true,
    contentMarkdown: `# 阶段 2：原生 JavaScript 任务看板

先不要碰框架。用 HTML/CSS/原生 JS 做一个**本地任务看板**：添加任务、标记完成、删除，并把数据存进 \`localStorage\`。

## 1. 状态与渲染

“状态”就是“当前数据的样子”。把“状态 → 界面”视为一个函数：

\`\`\`js
const state = { tasks: [] };
function render() {
  const list = document.getElementById("task-list");
  list.innerHTML = state.tasks.map(t => \`<li>\${t.text}</li>\`).join("");
}
\`\`\`

## 2. 持久化

\`\`\`js
function save() {
  localStorage.setItem("tasks", JSON.stringify(state.tasks));
}
\`\`\`

> 当“状态”和“界面”需要保持一致时，render 会越来越难维护——这正是 React 想帮你解决的。`,
    courseSlug: COURSE_SLUG, courseTitle: COURSE_TITLE, status: "not_started", mastery: 0,
    exercises: demoExerciseCatalog.exercises["s2-ex1-render"]
      ? [{ ...demoExerciseCatalog.exercises["s2-ex1-render"], status: "not_started" as const, mastery: 0 }]
      : [],
    nextLessonSlug: "s3-react", prevLessonSlug: "s1-dev-environment",
  },
  "s3-react": {
    id: "demo-s3", slug: "s3-react", title: f3, orderIndex: 2, requiresPass: true,
    contentMarkdown: `# 阶段 3：用 React 重写看板

用 React 重写上一阶段的任务看板，体会“状态驱动界面”。

## 核心思想：状态 → 界面

React 在“状态”发生变化时自动重新渲染相关组件：

\`\`\`tsx
function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  return <ul>{tasks.map((t) => <li key={t.id}>{t.text}</li>)}</ul>;
}
\`\`\`

> 对比原生 JS：你不再手动操作 DOM，只声明“界面是状态的函数”。`,
    courseSlug: COURSE_SLUG, courseTitle: COURSE_TITLE, status: "not_started", mastery: 0,
    exercises: [demoExerciseCatalog.exercises["s3-demo-choices"]].filter(Boolean).map((e) => ({ id: e.id, slug: e.slug, prompt: e.prompt, answerType: e.answerType, status: "not_started", mastery: 0 })),
    nextLessonSlug: "s4-node-postgres", prevLessonSlug: "s2-vanilla-js",
  },
  "s4-node-postgres": {
    id: "demo-s4", slug: "s4-node-postgres", title: f4, orderIndex: 3, requiresPass: true,
    contentMarkdown: `# 阶段 4：Node/Express API + PostgreSQL 持久化

为看板加一个真正的后端。对比一下“选型”与“写代码”的分工。

## 为什么默认选 PostgreSQL

- 提供约束、事务、成熟生态，适合强关联业务数据。
- 只有需求“文档结构极灵活、弱关联、高写入且可接受最终一致”时，才考虑 MongoDB。

## 最小 API

\`\`\`ts
router.get("/api/tasks", async (_req, res) => {
  const tasks = await db.select().from(tasks).all();
  res.json(tasks);
});
\`\`\`

> 写一份 ADR：为什么选 PostgreSQL 而不是 MongoDB。`,
    courseSlug: COURSE_SLUG, courseTitle: COURSE_TITLE, status: "not_started", mastery: 0,
    exercises: ([] as Array<{ id: string; slug: string; prompt: string; answerType: "text" | "code" | "choices" }>).concat(
      demoExerciseSummaries().filter((e) => e.slug.startsWith("s4"))
    ),
    nextLessonSlug: null, prevLessonSlug: "s3-react",
  },
};

export function demoLesson(slug: string): LessonDetail | null {
  return content[slug] ?? null;
}
