import type { CourseDef } from "../types";

// 主课程：4 个阶段，从“工单管理系统”逐步扩展成完整全栈项目。
export const courses: CourseDef[] = [
  {
    slug: "fullstack-ticket-system",
    title: "全栈工单管理系统（从零到上线）",
    description:
      "用一个逐步扩展的真实项目掌握完整全栈：先写原生 JS 前端，再上 React、Node/Express API、PostgreSQL、测试、CI/CD 与部署。每个阶段都要求先做技术选型和 ADR。",
    orderIndex: 0,
    lessons: [
      {
        slug: "s1-dev-environment",
        title: "阶段 1：开发环境、终端与 Git",
        orderIndex: 0,
        requiresPass: true,
        contentMarkdown: `# 阶段 1：开发环境、终端与 Git

工单管理系统的第一站，先解决“环境”问题。这个阶段你不需要写业务逻辑，而是把一条从“敲命令”到“代码入库”的路走通。

## 1. 终端是开发者的方向盘

- **工作目录**：\`pwd\` 显示当前目录；\`ls\` 列出文件；\`cd\` 切换目录。
- **创建文件**：\`touch app.js\`；**查看文件**：\`cat app.js\`。
- **环境变量**：\`echo $PATH\`、\`export FOO=bar\`。很多“为什么这行能跑那行不能”都跟 PATH 有关。

## 2. Git：后悔药与时光机

- \`git init\`：把目录变成仓库。
- \`git add <file>\`：把改动放进暂存区。
- \`git commit -m "说明"\`：提交一个版本。
- \`git log --oneline\`：查看提交历史。
- \`git status\`：随时确认“我改了什么”。

## 3. 给自己定规矩

每次动手前先问：\`我现在在哪个目录？\`、\`我要创建/修改哪个文件？\`、\`改完怎么验证？\`

> 练习：提交你的第一个 commit，并在评论区用一句话说明你执行了哪些命令。`,
        exercises: [
          {
            slug: "s1-ex1-git-commit",
            prompt: "在终端中执行 git init、git add、git commit（至少一条），然后说明这些命令各做了什么。",
            hints: ["git init 是在哪个目录执行的？", "git add 和 git commit 的顺序为什么不能颠倒？", "git status 能帮你确认什么？"],
            solution: "git init 把当前目录变为仓库；git add 把改动加入暂存；git commit 将暂存内容固化为一个版本。三者顺序是 init → add → commit。",
            rubric: ["理解三个命令作用", "能说清顺序", "能说明验证方式 git status / git log"],
            answerType: "text",
          },
          {
            slug: "s1-ex2-path",
            prompt: "你的 PATH 环境变量里如果少了一个包含 node 的目录，敲 node 会报什么？为什么？",
            hints: ["shell 是如何找到 node 这个命令的？", "which node 会显示什么？", "export PATH=... 有什么用？"],
            solution: "会报 command not found。shell 在当前目录和 PATH 列出的目录里查找可执行文件，找不到就会报 command not found。",
            rubric: ["能答出 command not found", "能解释 PATH 的查找机制"],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s2-vanilla-js",
        title: "阶段 2：用原生 JS 做一个能用的任务看板",
        orderIndex: 1,
        requiresPass: true,
        contentMarkdown: `# 阶段 2：原生 JavaScript 任务看板

先不要碰框架。用 HTML/CSS/原生 JS 做一个**本地任务看板**：添加任务、标记完成、删除，并把数据存进 \`localStorage\`。这段经历会告诉你 React 到底解决了什么问题。

## 1. 最小结构

- \`index.html\`：页面结构。
- \`style.css\`：样式。
- \`app.js\`：逻辑。

## 2. 状态与渲染

"状态"就是"当前数据的样子"。把"状态 → 界面"视为一个函数：

\`\`\`js
const state = { tasks: [] };
function render() {
  const list = document.getElementById("task-list");
  list.innerHTML = state.tasks.map(t => \`<li>\${t.text}</li>\`).join("");
}
\`\`\`

## 3. 持久化

刷新就丢数据的看板没有意义。用 \`localStorage\`：

\`\`\`js
function save() {
  localStorage.setItem("tasks", JSON.stringify(state.tasks));
}
function load() {
  const raw = localStorage.getItem("tasks");
  state.tasks = raw ? JSON.parse(raw) : [];
}
\`\`\`

## 4. 自问

> 当"状态"和"界面"需要保持一致、又要加"筛选/编辑/拖拽"时，你的 render 函数会越来越难维护——这正是 React 等框架想帮你解决的。`,
        exercises: [
          {
            slug: "s2-ex1-render",
            prompt: "写一个 render() 函数：从 state.tasks 渲染 <li>，并为每个任务提供“完成”和“删除”两个按钮。",
            hints: ["render 只负责把 state 变成界面，不做其他事。", "用 data-index 记录每个任务的索引，事件里读出来。", "事件处理里先改 state，再调用 render()。"],
            solution: `function render() {
  const list = document.getElementById("task-list");
  list.innerHTML = state.tasks.map((t, i) =>
    \`<li>\${t.text} <button data-i="\${i}" data-act="done">完成</button> <button data-i="\${i}" data-act="del">删除</button></li>\`
  ).join("");
}`,
            rubric: ["能渲染任务列表", "按钮有完成/删除", "用事件委托或 data-index 绑定"],
            answerType: "code",
          },
          {
            slug: "s2-ex2-persist",
            prompt: "点击“完成”后：改 state、save()、render()。请说明这三步缺一不可的原因。",
            hints: ["只改 state 不 render，界面不会更新。", "只 render 不 save，刷新就丢。", "save 应该保存最新 state。"],
            solution: "改 state 是改数据；save() 持久化到 localStorage；render() 把新数据画出来。缺 save 则刷新丢数据，缺 render 则界面不更新。",
            rubric: ["能指出三层职责", "能解释刷新丢失"],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s3-react",
        title: "阶段 3：用 React 重写看板",
        orderIndex: 2,
        requiresPass: true,
        contentMarkdown: `# 阶段 3：React 重写看板

用 React 把阶段 2 的看板重写一遍，体会“声明式”与“组件化”。

## 1. 为什么是组件

看板的"单项任务"是一个组件；"整个列表"是另一个组件。组件的输入叫 \`props\`：

\`\`\`tsx
function Task({ task, onDone, onDelete }: {
  task: TaskType; onDone: () => void; onDelete: () => void;
}) {
  return (
    <li>
      {task.text}
      <button onClick={onDone}>完成</button>
      <button onClick={onDelete}>删除</button>
    </li>
  );
}
\`\`\`

## 2. 状态提升

"任务列表"这个状态放在父组件，子组件通过 \`onDone\` / \`onDelete\` 通知父组件改状态。数据单向向下，事件向上。

## 3. 与原生 JS 对比

原生 JS 要手动 \`innerHTML\` + 事件绑定；React 只要声明"根据 state 渲染什么"，Diff 交给框架。代价是多一层抽象、需要构建工具。

> 自问：为什么这里要学 React？纯内联单页够用吗？`,
        exercises: [
          {
            slug: "s3-ex1-component",
            prompt: "定义 Task 组件，接收 task: {id,text,done}，渲染文字，点击时调用 onToggle。",
            hints: ["props 是只读的。", "onToggle 应带 task.id 或由父组件传出去。", "用 TS 接口描述 props 类型。"],
            solution: `interface Props { task: { id: string; text: string; done: boolean }; onToggle: (id: string) => void; }
function Task({ task, onToggle }: Props) {
  return <li onClick={() => onToggle(task.id)}>{task.done ? "✅" : "⬜"} {task.text}</li>;
}`,
            rubric: ["定义组件", "props 类型化", "事件向上传递"],
            answerType: "code",
          },
          {
            slug: "s3-ex2-state-up",
            prompt: "状态应该放 Task 里还是放父组件？为什么？",
            hints: ["删除一个任务需要知道所有任务。", "子组件不能直接改父组件状态，只能通过回调。", "状态提升的代价是传参更繁琐。"],
            solution: "状态放在父组件（状态提升）。因为删除/完成需要整个列表，父组件拥有数据，通过回调让子组件发出事件。",
            rubric: ["能答出放父组件", "能解释原因：需要整个列表/数据双向流转"],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s4-node-postgres",
        title: "阶段 4：Node/Express API + PostgreSQL 持久化",
        orderIndex: 3,
        requiresPass: true,
        contentMarkdown: `# 阶段 4：Node/Express API + PostgreSQL

前端做完了，现在给看板加后端：用 Node/Express 提供 REST API，用 PostgreSQL 存任务。

## 1. 什么是 REST

资源用 URL 表示，操作用 HTTP 方法表示：

- \`GET /api/tasks\` 列出任务
- \`POST /api/tasks\` 新建任务
- \`PATCH /api/tasks/:id\` 更新任务
- \`DELETE /api/tasks/:id\` 删除任务

## 2. 数据库选型：为什么默认 PostgreSQL

- 任务是**强关联**数据（任务↔用户↔状态），关系型模型自然。
- PostgreSQL 事务、索引、约束成熟，迁移风险低，是业务系统的稳妥默认。
- 只有"文档结构灵活、低关联、明确读多写多但不需要强一致"时，才考虑 MongoDB。

## 3. 最小 API

\`\`\`ts
// Express 5 路由
router.get("/api/tasks", async (req, res) => {
  const tasks = await db.select().from(tasks).all();
  res.json(tasks);
});
\`\`\`

## 4. 写 ADR

哪怕只写三行。记录"为什么选 PostgreSQL 而不是 MongoDB"：需求、候选、权衡、风险、迁移成本。`,
        exercises: [
          {
            slug: "s4-ex1-api-shape",
            prompt: "为“新建任务”设计 REST 接口：方法、URL、请求体、响应体各是什么？",
            hints: ["创建资源用 POST。", "URL 是资源复数名。", "请求体要包含 text，响应应返回带 id 和 createdAt 的对象。"],
            solution: "POST /api/tasks；Body: {text}; 响应 201: {id, text, done:false, createdAt}。",
            rubric: ["方法正确 POST", "URL 正确", "响应包含 id/状态"],
            answerType: "text",
          },
          {
            slug: "s4-ex2-pg-vs-mongo",
            prompt: "为什么默认选 PostgreSQL？说出至少 2 个理由，并说明什么情况下你才会改用 MongoDB。",
            hints: ["关系/约束/事务。", "团队熟悉度与运维。", "MongoDB 的场景：灵活 schema、低关联、高写入。"],
            solution: "PostgreSQL 提供约束、事务、成熟生态，适合强关联业务数据。只有当文档结构极灵活、关联弱、读多写多且可接受最终一致时才考虑 MongoDB。",
            rubric: ["给出关系型优势", "给出切换条件", "体现权衡而非喜好"],
            answerType: "text",
          },
          {
            slug: "s4-ex3-express-route",
            prompt: "补全 Express 5 路由：GET /api/tasks 返回从数据库查出的任务。",
            hints: ["用 drizzle 的 select().from(...).all()。", "res.json 返回响应。", "注意 async/await 与错误处理。"],
            solution: `router.get("/api/tasks", async (req, res, next) => {
  try {
    const tasks = await db.select().from(tasks).all();
    res.json(tasks);
  } catch (err) { next(err); }
});`,
            rubric: ["方法/URL 正确", "查询数据库", "有错误处理"],
            answerType: "code",
          },
        ],
      },
    ],
    projects: [
      {
        slug: "p1-static-page",
        title: "项目 1：发布你的静态个人主页",
        description: "用 HTML/CSS 做一个静态个人主页，部署到任意静态托管，走通“写代码→提交→上线”最小闭环。",
        orderIndex: 0,
        tasks: [
          "用 git 管理代码，至少 2 个 commit",
          "包含标题、介绍、一个链接",
          "发布到一个可访问的 URL",
          "在 README 写清楚如何本地运行",
        ],
        acceptanceCriteria: [
          "有可访问的线上地址",
          "代码在 git 仓库中",
          "README 含运行说明",
        ],
      },
      {
        slug: "p2-vanilla-board",
        title: "项目 2：原生 JS 任务看板",
        description: "纯 HTML/CSS/JS 的本地任务看板，状态存 localStorage，含添加/完成/删除/筛选。",
        orderIndex: 1,
        tasks: [
          "添加任务、标记完成、删除",
          "支持按状态筛选",
          "数据用 localStorage 持久化",
          "README 说明实现思路",
        ],
        acceptanceCriteria: [
          "刷新后数据不丢",
          "三类操作可用",
          "代码结构清晰（render/save）",
        ],
      },
      {
        slug: "p3-react-board",
        title: "项目 3：React 版任务看板",
        description: "用 React 重写看板，组件化、状态提升、加基础单测。",
        orderIndex: 2,
        tasks: [
          "React 组件拆分（Task/Board）",
          "状态放父组件，事件向上",
          "至少 1 个针对纯逻辑的单测",
          "写一段对比原生 JS 的总结",
        ],
        acceptanceCriteria: [
          "组件可复用",
          "单测通过",
          "能说明 React 解决了什么问题",
        ],
      },
      {
        slug: "p4-fullstack-board",
        title: "项目 4：全栈工单系统",
        description: "前端 React + 后端 Node/Express + PostgreSQL，实现任务 CRUD、基础验证、错误处理与一份 ADR。",
        orderIndex: 3,
        tasks: [
          "后端 REST API（CRUD）",
          "连接 PostgreSQL 并建表",
          "前端对接 API",
          "补充输入校验与统一错误响应",
          "写一份 ADR：为何选 PostgreSQL",
        ],
        acceptanceCriteria: [
          "CRUD 全链路可用",
          "有数据库持久化",
          "有统一错误格式",
          "有 ADR",
        ],
      },
    ],
  },
];
