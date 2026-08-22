import type { CourseDef, LessonTerminalStep, ProjectRubricCriterion } from "../types";
import { PROJECT_TESTS } from "./tests";

const terminalStep = (lesson: string, index: number, title: string, kind: LessonTerminalStep["kind"], durationMinutes: number, command: string, output: string): LessonTerminalStep => ({
  id: `${lesson}-terminal-${index}`, title, kind, durationMinutes, command, output,
});

const TERMINAL_STEPS: Record<string, LessonTerminalStep[]> = {
  "s1-dev-environment": [
    terminalStep("s1-dev-environment", 1, "确认工作目录", "setup", 5, "pwd && git rev-parse --show-toplevel", "仓库顶层路径与当前项目目录一致。"),
    terminalStep("s1-dev-environment", 2, "核对工具链", "setup", 5, "node --version && npm --version && git --version", "记录 Node.js、npm 与 Git 的实际版本。"),
    terminalStep("s1-dev-environment", 3, "建立 Git 基线", "implement", 10, "git init && git status && git add README.md .gitignore", "暂存区只包含需求基线文件。"),
    terminalStep("s1-dev-environment", 4, "验证提交", "verify", 5, "git commit -m \"docs: establish ticket system baseline\" && git status", "提交成功且工作区干净。"),
  ],
  "s2-vanilla-js": [
    terminalStep("s2-vanilla-js", 1, "检查原生项目", "setup", 5, "ls index.html style.css app.js", "三个浏览器入口文件均存在。"),
    terminalStep("s2-vanilla-js", 2, "运行静态检查", "implement", 10, "node --check app.js", "JavaScript 语法检查通过。"),
    terminalStep("s2-vanilla-js", 3, "验证持久化契约", "verify", 15, "npm test -- --run s2", "新增、完成、删除和刷新恢复用例通过。"),
  ],
  "s3-react": [
    terminalStep("s3-react", 1, "安装并检查类型", "setup", 5, "npm ci && npm run typecheck", "React 组件与 props 类型检查通过。"),
    terminalStep("s3-react", 2, "运行组件测试", "implement", 15, "npm test -- --run s3", "渲染、事件上报和筛选行为通过。"),
    terminalStep("s3-react", 3, "构建前端", "verify", 10, "npm run build", "生产构建产物生成成功。"),
  ],
  "s4-node-postgres": [
    terminalStep("s4-node-postgres", 1, "检查 API 契约", "setup", 10, "npm run typecheck", "路由、仓储和数据库类型一致。"),
    terminalStep("s4-node-postgres", 2, "应用数据库迁移", "implement", 10, "npm run db:migrate", "开发数据库结构与版本化迁移一致。"),
    terminalStep("s4-node-postgres", 3, "验证 CRUD API", "verify", 15, "npm test -- --run s4-node-postgres", "创建、列表、更新、删除及错误响应通过。"),
  ],
  "s4-auth-authorization": [
    terminalStep("s4-auth-authorization", 1, "检查会话配置", "setup", 5, "npm run typecheck", "认证上下文和会话类型检查通过。"),
    terminalStep("s4-auth-authorization", 2, "验证身份边界", "implement", 15, "npm test -- --run auth", "未登录请求被拒绝，登录身份可被解析。"),
    terminalStep("s4-auth-authorization", 3, "验证对象级授权", "verify", 15, "npm test -- --run authorization", "所有者可操作，他人工单返回拒绝且数据不变。"),
  ],
  "s4-testing-ci": [
    terminalStep("s4-testing-ci", 1, "检查测试配置", "setup", 5, "npm run typecheck", "测试夹具与应用类型检查通过。"),
    terminalStep("s4-testing-ci", 2, "执行完整测试", "implement", 20, "npm test -- --run", "单元、集成和边界测试完成并输出报告。"),
    terminalStep("s4-testing-ci", 3, "模拟 CI 门禁", "verify", 10, "npm run typecheck && npm test && npm run build", "类型检查、测试和构建均成功。"),
  ],
  "s4-docker-deployment": [
    terminalStep("s4-docker-deployment", 1, "检查容器配置", "setup", 5, "docker compose --env-file .env.example config", "Compose 配置展开成功且未读取真实秘密。"),
    terminalStep("s4-docker-deployment", 2, "构建应用镜像", "implement", 15, "docker build -t ticket-system:local .", "应用镜像构建成功。"),
    terminalStep("s4-docker-deployment", 3, "验证服务健康", "verify", 15, "docker compose up -d && curl http://localhost:3000/api/health", "服务启动并返回健康响应；命令仅为示例，不执行 Docker。"),
  ],
};

function createProjectRubric(evidence: {
  implementation: string;
  verification: string;
  decisionRecord: string;
}): ProjectRubricCriterion[] {
  const observableLevels = (criterionEvidence: string): ProjectRubricCriterion["levels"] => ({
    excellent: `提交包含“${criterionEvidence}”，证据相互一致，并覆盖至少一个边界或权衡。`,
    competent: `提交包含“${criterionEvidence}”，且能够支持预期行为。`,
    developing: `提交包含“${criterionEvidence}”的部分证据，但至少一项关键行为未被支持。`,
    missing: `提交未包含“${criterionEvidence}”，或现有证据与要求冲突。`,
  });

  return [
    {
      id: "implementation",
      criterion: "实现与项目任务一致",
      weight: 40,
      evidence: [evidence.implementation],
      levels: observableLevels(evidence.implementation),
    },
    {
      id: "verification",
      criterion: "验收结论有可审查证据",
      weight: 35,
      evidence: [evidence.verification],
      levels: observableLevels(evidence.verification),
    },
    {
      id: "decision-record",
      criterion: "设计决策及取舍有记录",
      weight: 25,
      evidence: [evidence.decisionRecord],
      levels: observableLevels(evidence.decisionRecord),
    },
  ];
}

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
        terminalSteps: TERMINAL_STEPS["s1-dev-environment"],
        title: "第 1 阶段课时：开发环境、终端与 Git",
        orderIndex: 0,
        requiresPass: true,
        contentMarkdown: `# 第 1 阶段课时：开发环境、终端与 Git

## 阶段位置与真实场景

你将从工单系统的需求基线开始工作。团队需要一个能复现环境、追踪改动并在出错时回到已知版本的仓库；因此第一步不是写业务功能，而是建立“知道自己在哪里、执行了什么、如何证明结果”的工程闭环。

## 学习目标

- 能够在 Windows PowerShell 或 Unix shell 中定位项目目录并验证 Node.js、npm、Git 的可用性（证据：练习 \`s1-ex2-path\` 的命令、预期输出和修复记录）。
- 能够创建 Git 仓库并提交一项可解释的变更，同时用 \`git status\` 与 \`git log --oneline\` 证明工作区和历史状态（证据：练习 \`s1-ex1-git-commit\`）。
- 能够诊断“命令找不到”和“在错误目录操作”两类失败，并给出不破坏已有文件的修复步骤（证据：练习 \`s1-ex2-path\` 的两份诊断记录）。

## 前置条件

- 一台可创建普通文件夹的 Windows、macOS 或 Linux 电脑。
- Node.js 20 或更高版本、npm 与 Git；如果尚未安装，先使用各工具官方安装器，不要复制来历不明的安装脚本。
- Windows 使用 PowerShell；macOS/Linux 使用 bash、zsh 等 shell。命令不同处会并列给出。
- 一个空目录，建议命名为 \`ticket-system\`；不要在桌面根目录或已有仓库内部执行 \`git init\`。

## 本阶段交付物

- 一个包含 \`README.md\` 与 \`.gitignore\` 的 \`ticket-system\` Git 仓库。
- 一份环境核对记录，包含当前目录、Node.js、npm、Git 的命令和实际版本输出。
- 至少一个描述清楚的提交，以及提交后的 \`git status\` 和 \`git log --oneline\` 输出。
- 一段失败诊断记录：症状、定位命令、原因和修复结果。

## 实施步骤

### 步骤 1：创建并确认工作目录

**动作**：在 PowerShell 执行 \`New-Item -ItemType Directory ticket-system\`、\`Set-Location ticket-system\`、\`Get-Location\`；在 Unix shell 执行 \`mkdir ticket-system\`、\`cd ticket-system\`、\`pwd\`。随后用 \`Get-ChildItem -Force\` 或 \`ls -la\` 查看目录。

**原因**：先确认绝对路径可以避免在错误目录初始化仓库，也能防止把无关文件意外纳入版本控制。

**产出**：一个位置明确的空项目目录。

**验证**：路径最后一段应为 \`ticket-system\`，目录列表不应出现上级项目的 \`.git\`。若存在，停止并重新选择目录。

### 步骤 2：核对工具链与命令解析

**动作**：执行 \`node --version\`、\`npm --version\`、\`git --version\`。PowerShell 再执行 \`Get-Command node\`，Unix shell 执行 \`command -v node\`。

**原因**：版本号证明程序能启动，命令定位结果证明当前 shell 从哪个路径解析可执行文件；两者共同排除 PATH 指向错误版本的问题。

**产出**：包含版本号和可执行文件路径的环境核对记录。

**验证**：Node.js 主版本至少为 20，三个版本命令退出成功；命令定位路径应指向你预期的安装目录。

### 步骤 3：建立需求基线文件

**动作**：创建 \`README.md\`，写入“工单系统需求基线”和本地环境版本；创建 \`.gitignore\`，至少加入 \`node_modules/\`、\`.env\` 和日志文件模式。PowerShell 可用 \`New-Item README.md,.gitignore\`，Unix shell 可用 \`touch README.md .gitignore\`。

**原因**：README 让下一位开发者知道项目目标和环境，\`.gitignore\` 在首次提交前阻止依赖目录与秘密配置进入历史。

**产出**：可审查的项目说明和忽略规则。

**验证**：打开两个文件检查内容；执行目录列表确认文件位于仓库根目录，而不是上级目录。

### 步骤 4：初始化、暂存并提交

**动作**：依次执行 \`git init\`、\`git status\`、\`git add README.md .gitignore\`、\`git diff --cached\`、\`git commit -m "docs: establish ticket system baseline"\`。

**原因**：先检查状态、再审查暂存差异，可以在提交不可变历史前发现漏文件、错误路径或秘密信息。

**产出**：第一个只包含需求基线文件的 Git 提交。

**验证**：\`git status\` 应显示工作区干净；\`git log --oneline -1\` 应显示刚才的提交说明；\`git show --stat --oneline HEAD\` 应只列出两个预期文件。

## 核心概念与取舍

- **终端与图形界面**：图形界面适合浏览，终端命令更容易复制、记录和在 CI 中复现。本课以终端为证据来源，但不禁止日常使用图形工具。
- **工作区、暂存区、提交历史**：\`git add\` 选择本次提交的证据，\`git commit\` 固化它们。把所有改动一次性暂存更快，但会降低审查和回滚精度。
- **小提交与大提交**：一个提交只表达一个目的更容易定位失败；过度拆分则会制造没有独立意义的历史。本课把 README 与忽略规则放在同一“建立基线”提交中。
- **PATH 与绝对路径**：PATH 提供便利，但可能解析到旧版本；\`Get-Command\` 或 \`command -v\` 能显示实际命中的程序。

## 常见错误与诊断

### 错误 1：终端报告找不到 node 或 git

**症状**：PowerShell 显示“无法将 node 识别为 cmdlet”，或 Unix shell 显示 \`command not found\`。

**原因**：工具未安装、安装目录不在 PATH，或安装后当前 shell 尚未重新加载环境变量。

**定位**：PowerShell 执行 \`Get-Command node -ErrorAction SilentlyContinue\` 并检查 \`$env:Path\`；Unix shell 执行 \`command -v node\` 并检查 \`$PATH\`。

**修复**：使用官方安装器安装或修正用户级 PATH，关闭并重新打开终端，再重复版本与定位命令；不要通过复制可执行文件到系统目录来绕过 PATH。

### 错误 2：Git 把无关文件列为未跟踪

**症状**：\`git status\` 显示桌面文件、其他项目文件，或大量不属于工单系统的内容。

**原因**：在上级目录执行了 \`git init\`，或当前目录位于另一个仓库内部。

**定位**：执行 \`git rev-parse --show-toplevel\`，并与 \`Get-Location\` 或 \`pwd\` 的目标目录比较。

**修复**：停止暂存；回到正确目录重新确认路径。若错误仓库是刚刚创建且没有历史，先人工确认其边界再移除错误的 \`.git\`；不确定时保留文件并请求审查。

### 错误 3：提交因身份未配置而失败

**症状**：\`git commit\` 提示 \`Please tell me who you are\`。

**原因**：Git 缺少提交作者名称或邮箱。

**定位**：执行 \`git config --get user.name\` 和 \`git config --get user.email\`。

**修复**：为当前仓库设置经过确认的身份，例如 \`git config user.name "Your Name"\` 与 \`git config user.email "you@example.com"\`，然后重试提交；除非所有仓库都应共用该身份，否则不要直接加 \`--global\`。

## 完成检查

- [ ] 当前绝对路径以 \`ticket-system\` 结尾，仓库顶层路径与它一致。
- [ ] Node.js、npm、Git 的版本与命令定位结果已记录，Node.js 主版本至少为 20。
- [ ] \`.gitignore\` 排除了 \`node_modules/\` 和 \`.env\`，提交历史中没有秘密配置。
- [ ] \`git status\` 显示工作区干净，\`git log --oneline -1\` 显示基线提交。
- [ ] 能根据记录复述一次失败从症状到修复的完整路径，而不是只给最终命令。

## 复盘与迁移

- **设计取舍**：为什么本次把 README 与 \`.gitignore\` 放进同一个提交？如果团队要求每个文件单独审查，你会放弃当前方案并如何拆分？
- **失败复盘**：选择一次路径或命令解析失败，说明哪个验证动作最早能发现它，以及为什么当时没有执行。
- **迁移问题**：如果下一台机器使用不同操作系统，你会怎样把环境核对记录迁移成一份任何成员都能执行的启动清单？`,
        exercises: [
          {
            slug: "s1-ex1-git-commit",
            prompt: "提交一次基线提交的证据：列出从确认目录到 commit 的命令，粘贴提交后的 git status 与 git log --oneline -1 关键输出，并说明暂存审查避免了什么风险。若曾失败，再提交症状、定位命令和修复结果；不要粘贴含邮箱或令牌的完整配置。",
            hints: [
              "定位：先检查证据链是否同时回答：在哪里操作、暂存了什么、提交后状态怎样。",
              "概念：用 git rev-parse --show-toplevel、git diff --cached、git status 分别证明目录、暂存内容和工作区状态。",
              "路径：最后用 git log --oneline -1 与 git show --stat HEAD 给出提交存在且只含预期文件的证据。",
            ],
            solution: "示例证据链：先用 Get-Location/pwd 与 git rev-parse --show-toplevel 确认目录；git add README.md .gitignore 后用 git diff --cached 审查；提交后 git status 显示 working tree clean，git log --oneline -1 显示 docs: establish ticket system baseline，git show --stat HEAD 只列出两个文件。暂存审查可以阻止无关文件或秘密配置进入历史。",
            rubric: [
              "提交中包含仓库顶层路径的定位命令及预期目录",
              "提交中包含暂存审查命令并指出至少一项被规避的误提交风险",
              "提交中包含工作区干净的 git status 证据和最新提交的 git log 证据",
              "存在失败时，提交中按症状、定位命令、修复结果记录完整诊断链",
            ],
            answerType: "text",
          },
          {
            slug: "s1-ex2-path",
            prompt: "提交两份诊断记录：一份处理 node 命令找不到，另一份处理在错误目录初始化 Git。每份都写出所选 PowerShell 或 Unix shell 的症状、至少两个定位命令及预期输出、根因判断、不破坏已有文件的修复动作和重新验证结果；不要求同时执行两套 shell 命令。",
            hints: [
              "定位：先把两类症状分开：命令解析失败检查程序与 PATH，Git 文件范围异常检查当前目录与仓库顶层。",
              "概念：PowerShell 比较 Get-Command node 与 $env:Path，Unix shell 比较 command -v node 与 $PATH；目录问题比较当前位置与 git rev-parse --show-toplevel。",
              "路径：修复后分别重新验证 node 版本/可执行路径和仓库顶层/工作区文件范围；不确定错误 .git 的边界时停止并请求审查。",
            ],
            solution: "命令问题：PowerShell 用 Get-Command node -ErrorAction SilentlyContinue 与 $env:Path，Unix shell 用 command -v node 与 $PATH；按结果安装官方版本或修正用户级 PATH，重开 shell 后用 node --version 和定位命令复验。目录问题：用 Get-Location/pwd 与 git rev-parse --show-toplevel 比较；若 Git 列出上级无关文件，停止暂存并回到 ticket-system。只有确认错误仓库刚创建且无历史时才人工移除错误 .git，否则保留并请求审查；最后复验仓库顶层和 git status 文件范围。",
            rubric: [
              "提交中包含所选系统的原始症状和命令定位结果",
              "提交中包含 PATH 检查结果，并据此区分未安装与未加入 PATH",
              "提交中比较当前位置与仓库顶层，并根据 git status 说明错误目录症状",
              "两份记录均给出不覆盖已有文件的修复动作，以及版本/路径或仓库边界的重新验证证据",
            ],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s2-vanilla-js",
        terminalSteps: TERMINAL_STEPS["s2-vanilla-js"],
        title: "第 2 阶段课时：用原生 JavaScript 构建工单看板",
        orderIndex: 1,
        requiresPass: true,
        contentMarkdown: `# 第 2 阶段课时：用原生 JavaScript 构建工单看板

## 阶段位置与真实场景

你已经建立需求基线，现在要把静态说明变成可操作的浏览器应用。这个版本不使用框架：工单可以新增、完成、删除和筛选，并在刷新后恢复。亲手维护“状态、DOM、存储”三者的一致性，才能判断后续引入 React 的收益与代价。

## 学习目标

- 能够用单一 \`state.tasks\` 驱动工单列表，并通过稳定 id 完成新增、完成、删除和筛选（证据：练习 \`s2-ex1-render\` 的代码与行为记录）。
- 能够按“修改 state -> save -> render”的顺序持久化交互，并用刷新验证证明状态没有丢失（证据：练习 \`s2-ex2-persist\`）。
- 能够安全处理空输入、损坏 JSON 和旧 localStorage 数据，记录失败后的回退或迁移结果（证据：练习 \`s2-ex2-persist\` 的异常样例）。

## 前置条件

- 已完成第 1 课的 Git 仓库与干净基线提交。
- 会编辑 HTML、CSS 和 JavaScript 文件，并能使用浏览器开发者工具查看 Console 与 Application/Storage。
- 理解数组、对象、函数、事件和 \`JSON.stringify\`/\`JSON.parse\` 的基本用途。
- 本课只使用浏览器 API，不需要安装 npm 包；不要用框架或第三方状态库替代练习目标。

## 本阶段交付物

- \`index.html\`、\`style.css\`、\`app.js\` 组成的原生 JavaScript 工单看板。
- 添加、完成、删除、全部/未完成/已完成筛选的逐项行为记录。
- 刷新恢复、空输入拦截、损坏 JSON 回退和旧数据迁移的验证记录。
- 一段说明 \`state\`、\`save\`、\`render\` 职责与调用顺序的设计说明。

## 实施步骤

### 步骤 1：建立可访问的页面骨架

**动作**：创建工单输入框、提交按钮、筛选按钮组和带 \`id="ticket-list"\` 的列表；为输入框提供关联的 \`label\`，为筛选按钮使用 \`data-filter\`。

**原因**：先固定 DOM 查询边界和可访问名称，后续逻辑才能稳定定位元素，也能让键盘和辅助技术使用表单。

**产出**：无需 JavaScript 也能看出输入区、筛选区和列表区的 HTML 骨架。

**验证**：浏览器 Elements 面板中每个 id 只出现一次；点击 label 会聚焦输入框；Console 没有元素为 null 的错误。

### 步骤 2：定义单一状态与纯数据操作

**动作**：定义 \`state = { tasks: [], filter: "all" }\`，工单形状包含 \`id\`、\`text\`、\`done\`；新增时使用 \`crypto.randomUUID()\`，切换和删除都按 id 产生新数组。

**原因**：稳定 id 不会随筛选或删除改变；让状态成为唯一事实来源，可以随时从同一份数据重建界面。

**产出**：\`addTask\`、\`toggleTask\`、\`deleteTask\` 和 \`visibleTasks\` 四个只处理数据的函数。

**验证**：在 Console 依次调用函数，确认原任务 id 不变、完成状态正确、筛选结果与数量一致。

### 步骤 3：从状态安全渲染 DOM

**动作**：\`render()\` 先清空列表，再为 \`visibleTasks()\` 创建 \`li\`、文本节点与两个带 \`data-id\`/\`data-action\` 的按钮；用户输入通过 \`textContent\` 写入，不拼接进 \`innerHTML\`。

**原因**：每次完整投影可避免旧 DOM 与新状态分叉；\`textContent\` 不会把用户输入解释成 HTML，降低脚本注入风险。

**产出**：状态变化后可重复调用且结果一致的 \`render()\`。

**验证**：新增文本 \`<img src=x onerror=alert(1)>\` 时页面应显示原样文本而不创建图片；切换筛选不会改变任务 id。

### 步骤 4：绑定一次事件并完成交互闭环

**动作**：表单 \`submit\` 事件校验 \`trim()\` 后的文本；列表容器使用一次事件委托读取按钮的 \`data-action\` 和 \`data-id\`；筛选区更新 \`state.filter\`。每次有效变更都依次调用 \`save()\` 和 \`render()\`。

**原因**：事件委托不随重复渲染增加监听器；先修改状态再持久化和渲染，保证存储与界面读取的是同一版本。

**产出**：添加、完成、删除和筛选均可操作的看板。

**验证**：空白输入不会增加列表项；连续完成/删除同一工单只触发一次行为；筛选前后计数与状态一致。

### 步骤 5：安全加载并迁移本地数据

**动作**：\`load()\` 在 \`try/catch\` 中解析 \`localStorage.getItem("ticket-board:v2")\`；确认结果是数组并规范化字段。若只存在旧键 \`tasks\`，把旧的 \`{ text, done }\` 转换为带 id 的新形状，保存到 v2 键后保留旧键直到验证完成。

**原因**：localStorage 可能被旧版本、扩展或手工修改；解析成功不等于结构合法。先迁移、验证、再清理可以避免不可逆丢数。

**产出**：返回合法任务数组或安全空数组的加载函数，以及一次可追踪的 v1 -> v2 迁移。

**验证**：分别准备有效 v2、损坏 JSON、非数组 JSON 和旧 tasks 四种样例后刷新；应用不得白屏，旧任务应获得 id，损坏数据应回退并在 Console 给出不含敏感值的提示。

## 核心概念与取舍

- **状态作为事实来源**：直接修改 DOM 看似省事，但筛选和持久化会让多个副本漂移；完整 render 简单可靠，代价是列表很大时会做更多 DOM 工作。
- **稳定 id 与数组索引**：索引写法短，但删除或筛选后会指向另一条工单；稳定 id 多一个字段，却能保持身份不变。
- **事件委托与逐项绑定**：委托只绑定一次，适合频繁重建的列表；代价是需要解析事件目标并处理无关点击。
- **localStorage 与服务端数据库**：localStorage 无需后端、适合单机原型，但同步 API、容量有限、不能跨设备协作。第 4 阶段会把相同领域模型迁移到服务端。
- **全量重绘与增量更新**：全量重绘更容易证明一致性；当规模和交互复杂度上升时，React 的声明式协调可以减少手工 DOM bookkeeping。

## 常见错误与诊断

### 错误 1：损坏 JSON 导致页面白屏

**症状**：刷新后 Console 出现 \`Unexpected token\`，列表和事件都未初始化。

**原因**：直接调用 \`JSON.parse\`，没有捕获语法错误，也没有验证解析结果是不是数组。

**定位**：在 Application/Storage 查看对应键；把原始字符串复制到临时环境单独解析，并检查 \`Array.isArray(parsed)\`。

**修复**：用 \`try/catch\` 和结构检查返回安全空数组；先备份损坏值用于诊断，不要在捕获异常前覆盖原数据。

### 错误 2：空白工单仍被创建

**症状**：输入空格后列表出现没有文字的项，刷新后仍存在。

**原因**：只判断原始字符串是否为 \`""\`，或在校验前已经修改 state 并保存。

**定位**：在 submit 处理器记录 \`JSON.stringify(input.value)\` 与 \`JSON.stringify(input.value.trim())\`，检查变更顺序。

**修复**：先计算 \`const text = input.value.trim()\`，为空时返回并显示校验信息；只在通过校验后创建工单。

### 错误 3：点击一次却切换两次

**症状**：完成按钮点击后状态立刻恢复，或一次删除影响多项。

**原因**：每次 render 都给按钮重新绑定监听器，或使用筛选后已变化的数组索引定位任务。

**定位**：在事件处理器设置断点或计数，检查一次点击进入几次；比较按钮 data-id 与 state 中的稳定 id。

**修复**：只在初始化时给列表容器绑定一次事件委托，并始终按稳定 id 更新原始 state。

## 完成检查

- [ ] 空白输入被阻止，普通文本和类似 HTML 的文本都按纯文本显示。
- [ ] 添加、完成、删除各执行一次且刷新后结果保持。
- [ ] 全部、未完成、已完成筛选结果与任务数量一致。
- [ ] 有效 v2、损坏 JSON、非数组 JSON、旧版数据四种加载样例都有记录。
- [ ] 代码中只有 state 保存领域数据，DOM 和 localStorage 都由它派生。

## 复盘与迁移

- **设计取舍**：为什么选择完整 render 和事件委托，而不是逐项修改 DOM 并给每个按钮绑定事件？你放弃的方案在哪种规模下可能更合适？
- **失败复盘**：哪一种损坏或旧数据样例最晚才暴露问题？说明可以提前发现它的验证步骤。
- **迁移问题**：如果把 localStorage 状态迁移到服务端 API，稳定 id、加载失败和旧数据兼容这三项分别需要落到哪个系统边界？`,
        exercises: [
          {
            slug: "s2-ex1-render",
            prompt: "提交 render() 与列表事件委托代码：从 state.tasks 和 state.filter 渲染 li，为完成/删除按钮写入稳定 data-id，并用 textContent 显示用户文本。再提交三个行为样例：完成、删除、筛选后各自的预期状态和 DOM 结果；不要只贴截图。",
            hints: [
              "定位：先让 visibleTasks() 只返回数据，render() 只负责把返回值投影成 DOM。",
              "概念：用 createElement/textContent 创建文本，用按钮的 data-action 与 data-id 表达命令和目标。",
              "路径：列表容器只绑定一次 click，处理器根据 closest('button[data-action]') 分派，再按 id 更新 state。",
            ],
            solution: `function render() {
  list.replaceChildren();
  for (const task of visibleTasks()) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = task.text;
    item.append(text, actionButton("toggle", task.id, "完成"), actionButton("delete", task.id, "删除"));
    list.append(item);
  }
}

list.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
  if (!button) return;
  const id = button.getAttribute("data-id");
  const action = button.getAttribute("data-action");
  if (id && action === "toggle") toggleTask(id);
  if (id && action === "delete") deleteTask(id);
  save();
  render();
});`,
            rubric: [
              "提交代码从筛选后的 state 生成列表，且用户文本通过 textContent 写入",
              "提交代码为两个操作按钮提供稳定 data-id 和明确 data-action",
              "提交代码只在列表容器绑定一次事件，并按 id 更新原始 state",
              "提交中分别列出完成、删除、筛选后的预期状态与 DOM 结果",
            ],
            answerType: "code",
          },
          {
            slug: "s2-ex2-persist",
            prompt: "提交一次完成操作的 state -> save -> render 时序说明，并给出安全 load() 伪代码。用有效数据、损坏 JSON、非数组 JSON、旧版无 id 数据四个输入，逐项写出预期结果和刷新验证；不得声称系统替你运行了这些样例。",
            hints: [
              "定位：先写清每一步读取哪个版本的数据；交换 save 和状态修改的顺序会保存什么？",
              "概念：JSON.parse 需要 try/catch，解析成功后仍要用 Array.isArray 和字段检查判断结构。",
              "路径：旧数据先映射出稳定 id 并写入新键，验证成功前保留旧键，才能回退。",
            ],
            solution: "事件先按 id 产生新 state，save() 把这个新版本序列化，render() 再从同一 state 投影界面。load() 应捕获 JSON 语法错误、拒绝非数组结构，并规范化每项字段；旧版 {text,done} 数据映射为 {id,text,done} 后写入 ticket-board:v2。四个样例的预期分别是原样恢复、安全空数组、安全空数组、生成 id 后恢复；每项都需刷新后再次检查。",
            rubric: [
              "提交中逐步指出 state、save、render 各自读取和产生的数据版本",
              "提交的 load 方案同时处理 JSON 语法错误、非数组结构和字段规范化",
              "提交中说明旧数据迁移到新键、保留旧键和验证后清理的顺序",
              "提交中为四个输入分别给出预期结果与刷新后的检查方法",
            ],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s3-react",
        terminalSteps: TERMINAL_STEPS["s3-react"],
        title: "第 3 阶段课时：用 React 重构工单看板",
        orderIndex: 2,
        requiresPass: true,
        contentMarkdown: `# 第 3 阶段课时：用 React 重构工单看板

## 阶段位置与真实场景

原生看板已经证明需求可行，但每次新增筛选、编辑或错误状态都要手工同步 state 与 DOM。现在把相同领域模型迁移到 React：组件声明界面，父组件拥有共享状态，子组件只接收数据并上报事件。目标不是“换语法”，而是建立可测试、可替换的组件边界。

## 学习目标

- 能够把看板拆为 \`TicketBoard\`、\`TicketForm\`、\`TicketList\`、\`TicketItem\`，并用只读 TypeScript props 明确输入和事件（证据：练习 \`s3-ex1-component\`）。
- 能够把共享工单状态放在最近公共父组件，以“数据向下、事件向上”完成不可变新增、切换、删除和筛选（证据：练习 \`s3-ex2-state-up\`）。
- 能够用稳定 key 和惰性初始化迁移第 2 阶段的 localStorage 数据，并用已有测试脚手架验证纯更新函数（证据：阶段项目 3 的迁移记录与测试报告）。

## 前置条件

- 第 2 阶段看板源码与四类 localStorage 加载样例均可用，旧数据键和数据形状已经记录。
- 已获得教师提供的 React 19 + TypeScript 脚手架，\`npm run dev\`、\`npm run typecheck\` 和 \`npm test\` 脚本可运行；本课不配置测试框架。
- 理解 JavaScript 数组 \`map\`、\`filter\`、展开语法、模块导入导出和浏览器开发者工具。
- 迁移期间保留原生版本和旧 localStorage 键，直到 React 版本通过检查。

## 本阶段交付物

- React+TypeScript 工单看板源码，以及组件边界和状态所有权图。
- 只读 props 类型、稳定 key、不可变更新函数的代码证据。
- 第 2 阶段 localStorage 数据迁移记录，包含旧数据、迁移后数据和回退方式。
- \`npm run typecheck\` 结果、关键交互记录，以及至少一个纯更新函数测试结果。
- 一段比较原生 DOM 实现与 React 实现收益、成本和不适用场景的总结。

## 实施步骤

### 步骤 1：确认脚手架并迁移领域类型

**动作**：运行 \`npm run dev\` 和 \`npm run typecheck\` 确认基线；在 \`src/features/tickets/types.ts\` 定义 \`Ticket\` 与 \`TicketFilter\`，保持 \`id\`、\`text\`、\`done\` 与第 2 阶段一致。

**原因**：先证明脚手架正常可以区分环境失败与迁移失败；保持领域形状兼容可减少数据迁移变量。

**产出**：可编译的领域类型和一份迁移前基线记录。

**验证**：开发服务器显示空看板壳；typecheck 退出成功；类型文件不导入 React 或浏览器 API。

### 步骤 2：用只读 props 建立组件边界

**动作**：创建 \`TicketItem\` 接收 \`ticket\`、\`onToggle(id)\`、\`onDelete(id)\`；\`TicketList\` 接收筛选后的数组并用 \`ticket.id\` 作为 key。props 类型使用 \`Readonly<...>\` 或只读字段。

**原因**：子组件不能修改父组件数据；显式 id 回调让事件目标稳定，也让组件可以独立渲染和测试。

**产出**：不拥有业务状态的展示组件和清晰回调契约。

**验证**：临时传入两个固定工单，确认文字、完成状态和按钮可见；TypeScript 会拒绝在子组件中给 props 重新赋值。

### 步骤 3：提升状态并实现不可变更新

**动作**：\`TicketBoard\` 使用 \`useState<Ticket[]>\` 持有工单，用函数式更新 \`setTickets(current => ...)\` 实现新增、切换和删除；筛选值也由父组件持有并派生可见列表。

**原因**：列表、筛选和表单都依赖同一数据版本，最近公共父组件是最小共享边界；函数式更新避免闭包读取过期状态。

**产出**：由一个父组件协调、数据向下和事件向上的交互链。

**验证**：连续快速切换不同工单不会丢更新；React DevTools 中只有 \`TicketBoard\` 持有工单数组；原数组项没有被原地修改。

### 步骤 4：把更新规则提取为纯函数

**动作**：将 \`toggleTicket(tickets, id)\`、\`deleteTicket(tickets, id)\` 和 \`filterTickets(tickets, filter)\` 放入 \`model.ts\`，组件只调用这些函数。

**原因**：纯函数不依赖 DOM、React 或时间，输入输出可直接比较；这给后续测试与服务端迁移留下稳定边界。

**产出**：可独立测试的工单更新模块。

**验证**：使用脚手架已有测试运行器写一个切换测试，确认目标项创建新对象、非目标项值不变、输入数组保持不变；运行 \`npm test\` 记录结果。

### 步骤 5：惰性加载并兼容旧本地数据

**动作**：给 \`useState\` 传入惰性初始化函数，只在首次渲染读取 v2 键；若只有第 2 阶段旧键，复用已验证的迁移函数。用一个 \`useEffect\` 在 tickets 改变后写入 v2，验证成功前不删除旧键。

**原因**：渲染期间反复读存储会增加副作用；惰性初始化避免每次渲染解析，单一 effect 明确持久化边界。

**产出**：刷新可恢复、旧数据可迁移且可回退的 React 状态初始化。

**验证**：依次准备有效 v2、损坏 JSON、旧数据三种输入并刷新；首屏不应先写空数组覆盖旧数据，旧工单的稳定 id 在再次刷新后保持不变。

### 步骤 6：完成类型、行为和回归检查

**动作**：运行 \`npm run typecheck\` 与 \`npm test\`，再逐项执行添加、完成、删除、筛选、刷新恢复；比较原生版和 React 版结果。

**原因**：类型与纯函数测试只能覆盖部分风险，浏览器行为检查补足事件、存储和可访问性边界。

**产出**：命令结果和逐项行为记录，以及两版实现差异总结。

**验证**：所有命令退出成功；行为结果与第 2 阶段相同；Console 无 key、受控输入或重复更新警告。

## 核心概念与取舍

- **组件边界**：按独立职责和变化原因拆分比按标签数量拆分更稳定；过细组件会增加 props 传递，过粗组件会混合表单、列表和存储职责。
- **状态提升**：共享状态放在最近公共父组件能保持一致，代价是回调传递增加。只有一个组件使用且无需共享的数据不必提升。
- **不可变更新**：新数组/新对象让 React 通过引用变化判断更新；原地修改代码更短，却可能不触发渲染并破坏历史快照。
- **稳定 key**：key 表示列表项身份，不是显示位置。数组索引会在删除和筛选后复用组件状态，领域 id 才能跨操作保持身份。
- **Effect 边界**：effect 用于把 React 同外部存储同步，不应承担可由渲染计算的筛选逻辑；effect 越多，执行顺序和重复运行越难推理。
- **React 与原生 DOM**：React 适合状态和交互持续增长的界面；一个几乎不变的静态页面使用原生 HTML 可能更轻、更直接。

## 常见错误与诊断

### 错误 1：使用数组索引作为 key 后状态串位

**症状**：删除或筛选后，输入焦点、编辑状态或完成样式跑到另一条工单。

**原因**：\`key={index}\` 把位置当身份，列表重排后 React 复用了错误组件实例。

**定位**：查看 Console key 警告和 React DevTools；记录操作前后 index 与 ticket.id 的对应关系。

**修复**：从创建或迁移时就生成稳定领域 id，并在列表中使用 \`key={ticket.id}\`；不要在 render 中临时生成 key。

### 错误 2：原地修改数组后界面不更新

**症状**：对象的 done 值在调试器中改变，但界面保持原样或稍后才突然变化。

**原因**：直接修改 \`tickets[index].done\` 并把同一数组引用传回 setter。

**定位**：比较更新前后 \`Object.is(previous, next)\`，并检查是否使用了 \`push\`、\`splice\` 或属性赋值。

**修复**：用 \`map\`、\`filter\` 和对象展开产生新引用；将规则提取到纯函数并测试输入未被修改。

### 错误 3：首次渲染把旧数据覆盖为空数组

**症状**：原生版数据存在，但打开 React 版后存储键立即变成 \`[]\`。

**原因**：state 先初始化为空数组，持久化 effect 在加载/迁移完成前执行。

**定位**：在 Application/Storage 观察键的写入时机，并在初始化函数和 effect 设置断点比较顺序。

**修复**：用 \`useState(loadTickets)\` 惰性初始化，让首个 state 已是加载结果；只保留一个依赖 tickets 的保存 effect，并在验证前保留旧键。

## 完成检查

- [ ] 四个组件的职责、props 和状态所有者已记录，子组件没有修改 props。
- [ ] 所有列表项使用稳定 ticket.id 作为 key，render 中没有生成随机 key。
- [ ] 新增、切换、删除均使用函数式、不可变状态更新。
- [ ] 旧数据迁移、损坏数据回退和二次刷新结果已记录，旧键仍可回退。
- [ ] typecheck、纯函数测试和五项浏览器行为检查都有实际输出，不以截图代替命令文本。

## 复盘与迁移

- **设计取舍**：为什么把状态放在 \`TicketBoard\` 而不是每个 \`TicketItem\`？说明被放弃方案的局限和 props 传递的代价。
- **失败复盘**：选择 key、不可变更新或持久化中的一次失败，指出哪一个最小测试本可更早暴露它。
- **迁移问题**：如果工单改由服务端 API 提供，哪些本地纯函数可以保留，哪些 effect 必须替换为请求状态管理？`,
        exercises: [
          {
            slug: "s3-ex1-component",
            prompt: "提交一个 TicketItem 组件和调用片段：props 必须只读，接收 ticket、onToggle(id)、onDelete(id)，按钮点击只上报稳定 id，父列表用 ticket.id 作为 key。附上 TypeScript 拒绝修改 props 的错误摘要，以及点击两个按钮的预期回调参数。",
            hints: [
              "定位：先写 Ticket 与 TicketItemProps 类型，检查哪些值由父组件拥有、哪些只是事件通知。",
              "概念：回调签名使用 (id: string) => void，子组件中不要查找列表或修改 ticket.done。",
              "路径：在父组件 map 中把 key 与两个回调都绑定到同一个 ticket.id，再列出预期调用。",
            ],
            solution: `type Ticket = Readonly<{ id: string; text: string; done: boolean }>;
type TicketItemProps = Readonly<{
  ticket: Ticket;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}>;

function TicketItem({ ticket, onToggle, onDelete }: TicketItemProps) {
  return <li><span>{ticket.text}</span><button onClick={() => onToggle(ticket.id)}>完成</button><button onClick={() => onDelete(ticket.id)}>删除</button></li>;
}

{tickets.map((ticket) => <TicketItem key={ticket.id} ticket={ticket} onToggle={toggleTicket} onDelete={deleteTicket} />)}`,
            rubric: [
              "提交代码声明只读 ticket 字段和两个带 string id 参数的回调",
              "提交代码只通过回调上报事件，没有在子组件修改 ticket 或父数组",
              "提交的父列表使用 ticket.id 作为 key，并把同一 id 传给操作回调",
              "提交中包含 props 修改的 TypeScript 错误摘要和两个按钮的预期回调参数",
            ],
            answerType: "code",
          },
          {
            slug: "s3-ex2-state-up",
            prompt: "提交一份状态所有权决策：画出 TicketBoard、TicketList、TicketItem 的数据向下和事件向上关系，给出一次按 id 的不可变切换代码，并解释为什么放弃让每个 TicketItem 持有 done。至少列出当前方案的一项代价和采用局部状态方案的触发条件。",
            hints: [
              "定位：先列出哪些组件需要读取完整列表、筛选值和单项工单，再找最近公共父组件。",
              "概念：切换代码应从 current 数组产生新数组，只给目标 id 创建新对象。",
              "路径：被放弃方案不仅要写“不同步”，还要说明筛选、持久化或批量操作会出现什么冲突。",
            ],
            solution: "TicketBoard 拥有 tickets/filter，把筛选结果传给 TicketList，再把 ticket 传给 TicketItem；TicketItem 通过 onToggle(id) 向上报告。切换可写为 setTickets(current => current.map(ticket => ticket.id === id ? {...ticket, done: !ticket.done} : ticket))。若每项持有 done，父级筛选、持久化和批量更新会缺少统一快照。当前方案代价是回调传递；只有完全独立且无需父级读取的瞬时 UI 状态才留在单项组件。",
            rubric: [
              "提交图中明确标出 tickets/filter 数据向下和带 id 的事件向上",
              "提交代码使用函数式 setter、map 和对象展开，只更新目标 id",
              "提交中用筛选、持久化或批量操作的具体冲突解释被放弃方案",
              "提交中列出回调传递代价和局部状态方案的明确适用条件",
            ],
            answerType: "text",
          },
        ],
      },
      {
        slug: "s4-node-postgres",
        terminalSteps: TERMINAL_STEPS["s4-node-postgres"],
        title: "第四阶段第 1 课：Node/Express API 与 PostgreSQL",
        orderIndex: 3,
        requiresPass: true,
        contentMarkdown: `# 第四阶段第 1 课：Node/Express API 与 PostgreSQL

## 阶段位置与真实场景

React 看板目前只属于一台浏览器。第四阶段先把工单事实迁移到服务端：Node/Express 暴露资源接口，PostgreSQL 用约束、事务和迁移保存共享数据。本课只建立数据与 API 基线；身份、自动化检查和部署会在后续三课逐步加入。

## 学习目标

- 能够从工单用例推导 ER 模型和 OpenAPI 风格接口契约，明确成功与错误响应（证据：练习 \`s4-ex1-api-shape\`）。
- 能够依据约束、事务、查询模式和运维成本记录 PostgreSQL 选型，并给出放弃方案与迁移触发条件（证据：练习 \`s4-ex2-pg-vs-mongo\`）。
- 能够实现参数化的工单查询路由，区分空结果与数据库失败，并用 HTTP 响应和数据库查询交叉验证（证据：练习 \`s4-ex3-express-route\`）。

## 前置条件

- 第 3 阶段 React 工单类型、稳定 id 和行为清单已经冻结，可作为 API 字段来源。
- Node.js 20 或更高版本、课程提供的 Express/TypeScript/Drizzle 脚手架，以及一个专用开发 PostgreSQL 数据库。
- \`DATABASE_URL\` 只存在于本地 \`.env\`，\`.env\` 已被 Git 忽略；不得把真实密码写入答案、日志或提交。
- 会读 TypeScript 异步函数、JSON、HTTP 方法/状态码和基本 SQL；本课不要求配置 Docker。

## 本阶段交付物

- 工单与用户关系的 Mermaid ER 图，以及字段、主键、外键、唯一性和非空约束说明。
- \`GET /api/tasks\`、\`POST /api/tasks\`、\`PATCH /api/tasks/:id\`、\`DELETE /api/tasks/:id\` 的接口契约。
- 可重复执行的 schema 定义和生成迁移，附迁移前后检查与回退说明。
- 参数校验、仓储查询、统一错误格式和 CRUD 路由源码。
- HTTP 请求/响应、数据库查询和错误路径验证记录，以及 PostgreSQL 选型 ADR。

## 实施步骤

### 步骤 1：先冻结领域模型与接口契约

**动作**：从 React \`Ticket\` 推导服务端字段 \`id\`、\`text\`、\`done\`、\`createdAt\`、\`updatedAt\`，补上未来归属所需的 \`ownerId\`；画 ER 图并为四个资源操作写请求、成功状态、响应字段和错误状态。

**原因**：先定义可观察边界可以防止数据库列、路由和前端各自发明字段，也让后续迁移和测试有独立预期。

**产出**：一份版本化 ER 图和接口契约草案。

**验证**：逐字段检查 React 类型、ER 图和 JSON 响应命名一致；创建接口明确 \`201\`，非法输入明确 \`422\`，不存在资源明确 \`404\`。

### 步骤 2：把约束写入 schema 并生成迁移

**动作**：在 Drizzle schema 中定义 \`ticket\` 表，主键使用稳定 id，\`text\` 非空，\`done\` 有默认值，时间字段非空；通过仓库脚本生成迁移并人工阅读 SQL，不直接在共享数据库使用 push 猜测变更。

**原因**：数据库约束是所有调用方共享的最后防线；版本化迁移让环境能按相同顺序升级并审查数据风险。

**产出**：schema 变更、生成 SQL 和迁移说明。

**验证**：在空测试库应用全部迁移并查看表结构；再次运行迁移不应重复建表；确认 SQL 没有意外删除或重建已有表。

### 步骤 3：建立单一数据库访问边界

**动作**：从环境变量创建连接，在仓储模块实现 \`listTickets\`、\`createTicket\`、\`updateTicket\`、\`deleteTicket\`；所有输入通过 Drizzle/参数绑定进入查询，不拼接 SQL 字符串。

**原因**：路由只处理 HTTP，仓储只处理持久化，错误归属更清楚；参数化查询避免用户输入改变 SQL 结构。

**产出**：可由路由调用、可在测试库验证的工单仓储接口。

**验证**：在事务或独立测试库中创建、读取、更新、删除一条固定工单；检查空列表返回 \`[]\`，不存在 id 返回明确的“未找到”结果而不是异常。

### 步骤 4：实现成功路径与输入校验

**动作**：Express 路由解析路径和 JSON body，先验证 trim 后文本、布尔值和 id，再调用仓储；创建返回 \`201\` 和完整资源，列表返回 \`200\` 数组，更新/删除不存在资源返回 \`404\`。

**原因**：输入边界越靠近请求越容易给调用方具体反馈；统一状态码和响应形状让 React 客户端无需猜测失败类型。

**产出**：与接口契约一致的四个 CRUD 路由。

**验证**：分别发送有效创建、空文本、列表、存在 id 更新、不存在 id 更新和删除请求，对照契约逐字段比较状态码与 JSON。

### 步骤 5：统一处理数据库与未知错误

**动作**：路由把异常交给错误中间件；中间件记录内部错误标识而不记录密码/完整连接串，对客户端返回 \`{ error: { code, message } }\`。已知约束冲突映射为 \`409\`，未知数据库错误映射为 \`500\`。

**原因**：把堆栈或 SQL 直接返回会泄露内部信息；把所有失败都伪装成空数组又会让数据故障看起来像“没有工单”。

**产出**：稳定的错误响应和可关联的服务端日志。

**验证**：临时使用错误连接或受控仓储替身触发数据库失败，确认响应为 \`500\` 且不是 \`[]\`；日志有错误标识但没有 \`DATABASE_URL\`。

### 步骤 6：用外部证据验证全链路

**动作**：使用 curl 或 PowerShell \`Invoke-RestMethod\` 按契约执行 CRUD，再在数据库客户端用只读 SELECT 检查最终记录；把命令、状态码、响应摘要和查询结果写入验证记录。

**原因**：仅看路由源码不能证明请求经过 JSON 解析、数据库和响应序列化；HTTP 与数据库两侧证据可以发现“响应成功但没有写入”等断链。

**产出**：成功、空结果、校验失败、未找到和数据库失败五类验证记录。

**验证**：最终数据库状态与最后一个 HTTP 响应一致；删除后 GET 不再返回该 id；记录只陈述实际执行过的命令和看到的结果。

## 核心概念与取舍

- **资源契约**：URL 表示资源，HTTP 方法表达动作，状态码表达结果类别。把所有操作塞进 \`POST /action\` 容易实现，却削弱缓存、日志和客户端推理能力。
- **PostgreSQL 与文档数据库**：工单、用户和权限存在关系与约束，PostgreSQL 是稳妥默认；文档数据库适合形状高度变化、弱关联的场景，但不能用“更灵活”代替一致性与迁移分析。
- **约束与应用校验**：应用校验能提供友好错误，数据库约束能保护所有写入路径；两层重复是有意防御，不应二选一。
- **迁移与直接同步**：直接 push 适合一次性原型；版本化迁移更慢但可审查、可重放，是共享环境与生产数据的必要记录。
- **仓储边界**：独立仓储减少路由对 ORM 细节的依赖；在只有一个简单查询时可能显得多一层，但 CRUD 和测试很快会复用它。
- **ADR**：ADR 记录当时约束、候选、决定、后果和迁移触发条件，不是为偏好补写理由。

## 常见错误与诊断

### 错误 1：开发环境可以查询，测试库却缺表

**症状**：请求返回 \`relation "ticket" does not exist\`，但开发者本机数据库正常。

**原因**：只修改了 schema 或执行了直接 push，没有提交/应用相同迁移历史。

**定位**：比较迁移日志和数据库中的迁移记录，检查目标数据库表结构与生成 SQL。

**修复**：补充并审查版本化迁移，在独立备份或测试库先应用；不要手工创建表来掩盖缺失历史。

### 错误 2：空列表和数据库失败都返回 200 []

**症状**：数据库断开后客户端仍显示“暂无工单”，监控也看不到失败。

**原因**：catch 块吞掉异常并返回空数组，混淆了合法业务状态和系统故障。

**定位**：关闭测试连接或让仓储抛出受控错误，比较响应状态、body 和日志。

**修复**：合法空查询保留 \`200 []\`；异常交给错误中间件并返回 \`500\` 错误对象，同时记录可关联标识。

### 错误 3：更新不存在 id 仍报告成功

**症状**：PATCH 返回 \`200\`，但数据库影响行数为 0，随后 GET 仍不存在。

**原因**：路由没有检查 update returning/rowCount，直接构造了成功响应。

**定位**：用固定不存在 id 请求并检查仓储返回值、SQL 影响行数和响应状态。

**修复**：仓储返回更新后的行或 null；路由对 null 返回 \`404\`，只对真实更新结果返回 \`200\`。

## 完成检查

- [ ] ER 图、Drizzle schema 和 API JSON 字段逐项一致，主外键与非空约束已标明。
- [ ] 生成迁移已人工审查，并在空测试库和旧 schema 测试库应用成功。
- [ ] CRUD 请求包含成功、校验失败、未找到和数据库失败的实际状态码与响应证据。
- [ ] 空列表返回 \`200 []\`，数据库失败返回 \`500\` 错误对象，两者可区分。
- [ ] 查询参数没有字符串拼接，响应和日志都没有密码、连接串或内部堆栈。
- [ ] PostgreSQL ADR 包含候选方案、放弃理由、风险和迁移触发条件。

## 复盘与迁移

- **设计取舍**：为什么本项目选择 PostgreSQL 和版本化迁移？说明放弃文档数据库或直接 push 的具体原因与当前方案代价。
- **失败复盘**：选择一次迁移、约束或错误响应失败，指出接口契约中的哪条预期本可更早暴露它。
- **迁移问题**：当下一课加入用户身份后，ER 图、查询条件和错误状态需要怎样变化才能防止跨用户访问？`,
        exercises: [
          {
            slug: "s4-ex1-api-shape",
            prompt: "提交“新建工单”的 OpenAPI 风格接口契约：方法、URL、Content-Type、请求体字段与约束、201 响应全部字段，以及至少 422 和 500 两类错误响应。再给出一个有效请求和一个空文本请求的预期状态码/body；不要把示例写成已经执行过的测试结果。",
            hints: [
              "定位：先区分资源集合 URL 与新资源 id；创建成功由服务端生成哪些字段？",
              "概念：请求 text 需要字符串、trim 后非空和长度边界；响应应包含 id、done、createdAt、updatedAt。",
              "路径：把调用方可修复的输入错误与服务端未知错误分开，给它们稳定 code 和不同状态码。",
            ],
            solution: "POST /api/tasks，Content-Type application/json；body 为 {text:string}，trim 后 1..200 字符。成功返回 201 与 {id,text,done:false,createdAt,updatedAt}。空文本返回 422 与 {error:{code:'INVALID_TEXT',message:'...'}}；未知数据库失败返回 500 与不含内部堆栈的 {error:{code:'INTERNAL_ERROR',message:'...'}}。示例必须标为预期，实际验证后再记录观察结果。",
            rubric: [
              "提交契约包含 POST、/api/tasks、JSON Content-Type 和 text 的类型/非空/长度约束",
              "提交契约明确 201，并列出 id、text、done、createdAt、updatedAt 全部响应字段",
              "提交契约分别定义 422 与 500 的稳定错误 code 和公开 message",
              "提交中区分预期样例与实际执行证据，没有伪装运行结果",
            ],
            answerType: "text",
          },
          {
            slug: "s4-ex2-pg-vs-mongo",
            prompt: "提交 PostgreSQL 选型 ADR 摘要：列出工单系统至少三个约束/查询需求，比较 PostgreSQL 与一个被放弃方案，记录当前决定、两个风险和可测量的迁移触发条件。不得只写团队偏好或“更成熟”。",
            hints: [
              "定位：从用户-工单归属、唯一性、事务更新、筛选/排序查询中选具体约束。",
              "概念：比较项使用同一组需求，不要分别罗列两个数据库的宣传特点。",
              "路径：迁移触发条件应能观察，例如数据形状变化率、关联查询比例、扩展瓶颈或运维能力。",
            ],
            solution: "示例决定：工单有用户归属外键、状态约束和需要原子写入的审计记录，并按 owner/status/createdAt 联合筛选，因此选择 PostgreSQL。放弃文档数据库是因为应用层补关系和一致性的成本当前更高。风险包括 schema 迁移协调与连接容量。只有当大多数数据成为无固定结构的独立文档、关联查询显著下降，并经压测证明现有关系模型是瓶颈时才重新评估；迁移前先做双写/回读实验。",
            rubric: [
              "提交中列出至少三个与工单系统字段、关系、事务或查询直接相关的约束",
              "提交中用同一组约束比较 PostgreSQL 与一个明确被放弃方案",
              "提交中记录至少两个当前方案风险及对应缓解动作",
              "提交中给出可观察的迁移触发条件和迁移前验证方式",
            ],
            answerType: "text",
          },
          {
            slug: "s4-ex3-express-route",
            prompt: "提交 GET /api/tasks 的 Express 路由与仓储查询代码，并给出三种预期：有两条记录、合法空列表、数据库抛错。代码必须让空列表返回 200 []，让数据库错误进入统一错误中间件；附上你将如何用请求和 SQL 查询验证结果的步骤。",
            hints: [
              "定位：先让 listTickets() 只负责参数化查询并返回数组，不在仓储拼 HTTP 响应。",
              "概念：路由成功时直接 res.status(200).json(rows)，空数组也是成功结果。",
              "路径：catch 中把未知错误交给 next；错误中间件统一映射 500，不能在 catch 返回 []。",
            ],
            solution: `router.get("/api/tasks", async (req, res, next) => {
  try {
    const rows = await listTickets();
    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
});

async function listTickets() {
  return db.select().from(tickets).orderBy(tickets.createdAt);
}`,
            rubric: [
              "提交代码把 GET /api/tasks 的 HTTP 处理与 listTickets 仓储查询分开",
              "提交代码对普通数组和空数组都返回 200 JSON，未把空数组当错误",
              "提交代码把数据库异常交给统一错误中间件，未吞错或返回 []",
              "提交中为两条记录、空列表、数据库失败分别写出预期响应和外部验证步骤",
            ],
            answerType: "code",
          },
        ],
      },
      {
        slug: "s4-auth-authorization",
        terminalSteps: TERMINAL_STEPS["s4-auth-authorization"],
        title: "第四阶段第 2 课：认证、会话与对象级授权",
        orderIndex: 4,
        requiresPass: true,
        contentMarkdown: `# 第四阶段第 2 课：认证、会话与对象级授权

## 阶段位置与真实场景

API 和数据库已经能共享工单，但目前任何调用方都可能读取或修改任意记录。本课加入用户身份与对象级权限：密码只用于建立身份，会话令牌代表已登录状态，每次工单查询仍必须验证记录属于当前用户。完成后系统能区分“你是谁”和“你能操作哪条工单”。

## 学习目标

- 能够描述注册、登录、受保护请求、过期和登出的服务端 session 数据流，并为 cookie 选择可解释的安全属性（证据：练习 \`s4-auth-ex1-session-flow\`）。
- 能够在路由和数据库查询中同时应用认证用户 id 与工单 id，阻止跨用户对象访问（证据：练习 \`s4-auth-ex2-owner-guard\`）。
- 能够区分认证、授权、会话撤销与 CSRF 风险，并用未登录、越权、过期三类请求验证边界（证据：练习 \`s4-auth-ex1-session-flow\` 与 \`s4-auth-ex2-owner-guard\` 的失败路径记录）。

## 前置条件

- 第四阶段第 1 课的用户/工单 ER 图、CRUD API、统一错误格式和独立测试数据库可用。
- 阅读仓库 \`docs/ADR-004-session-auth.md\`，接受当前 MVP 使用服务端 session；不要在本课擅自切换认证框架。
- 了解 HTTPS 的目的、HTTP cookie 基本概念和数据库外键；生产环境必须由 HTTPS 承载认证 cookie。
- 准备两个测试用户和各自一条工单，全部使用虚构数据；不要把真实密码、令牌或完整 cookie 写入提交。

## 本阶段交付物

- 用户、session、工单归属的 ER 图更新，以及注册/登录/鉴权/登出时序图。
- 密码哈希、随机 session token、到期时间和 cookie 属性的实现说明。
- \`requireUser\` 认证边界与按 \`ownerId\` 查询的对象级授权代码。
- 未登录、正确所有者、错误所有者、过期 session、登出后重放五类验证记录。
- 一份小型威胁清单：密码泄露、令牌泄露、CSRF、会话固定和对象级越权的缓解措施与剩余风险。

## 实施步骤

### 步骤 1：先画身份与权限边界

**动作**：在 ER 图中加入 user 和 session：session 只保存随机 token 的服务端记录、userId、expiresAt；ticket 增加 ownerId 外键。画出浏览器、认证路由、session 存储和工单路由之间的数据流。

**原因**：先标出秘密和信任边界，才能判断哪些值可进入 cookie、数据库、日志或响应；授权缺口通常来自只画登录而漏画资源查询。

**产出**：包含身份、会话、资源归属和到期点的时序图/ER 图。

**验证**：图中密码不会离开注册/登录请求和哈希函数，cookie 不含密码，工单查询明确使用 session.userId。

### 步骤 2：安全处理注册与密码验证

**动作**：注册时规范化 email、校验密码边界，再用带随机 salt 的慢哈希保存 \`passwordHash\`；登录时读取用户并使用常量时间比较验证派生结果，错误响应不区分“邮箱不存在”和“密码错误”。

**原因**：密码加密后仍可被解密，密码哈希应不可逆且每个用户 salt 不同；统一登录错误减少账号枚举信息。

**产出**：不存明文密码、响应也不返回哈希的注册/登录服务。

**验证**：数据库中同一密码为两个用户产生不同哈希；正确密码成功，错误密码和未知邮箱返回同样公开错误；日志没有请求密码。

### 步骤 3：创建可撤销的服务端会话

**动作**：登录成功后用密码学安全随机源生成高熵 token，把 token、userId、expiresAt 存入 session 表；响应设置 cookie 的 \`HttpOnly\`、\`SameSite=Lax\`、\`Path=/\`、明确 \`Expires/Max-Age\`，生产 HTTPS 再设置 \`Secure\`。

**原因**：随机 token 不携带权限事实，服务端可以到期或删除它；HttpOnly 降低脚本读取风险，SameSite 只是 CSRF 防线的一部分，不能替代敏感请求的来源/令牌校验。

**产出**：可查找、可过期、可撤销的 session 与最小 cookie。

**验证**：浏览器存储中 cookie 不可由客户端脚本读取；数据库能通过 token 找到 userId 和到期时间；响应/日志不打印完整 token。

### 步骤 4：集中解析当前用户

**动作**：实现 \`requireUser\`：读取 cookie、查询 session 与 user、比较 expiresAt；无 token、未知 token、过期 token 都拒绝并清理无效 cookie，成功时只向后传递必要的 user id/角色。

**原因**：每个路由重复解析会产生不一致的到期和错误逻辑；认证中间件只证明身份，不应在这里假设用户拥有所有工单。

**产出**：统一返回当前用户或 \`401\` 的认证边界。

**验证**：对缺 cookie、随机 token、过期 token、有效 token 四种输入记录状态；只有有效 token 能进入下一处理器。

### 步骤 5：把对象级授权写进查询

**动作**：所有读取、更新、删除使用 \`WHERE ticket.id = ? AND ticket.owner_id = currentUser.id\`；创建时 ownerId 只取服务端当前用户，不接受客户端 ownerId。对没有匹配行的读取/修改返回统一 \`404\` 或项目约定结果。

**原因**：只检查“已登录”会导致任何用户枚举 id 后操作他人记录；把 ownerId 放进查询能避免先查后改之间的竞态和遗漏。

**产出**：认证身份参与每条资源查询的 CRUD 路由。

**验证**：用户 A 可以操作自己的工单，用户 B 使用同一 id 得到拒绝且数据库未变化；请求 body 伪造 ownerId 不会改变归属。

### 步骤 6：验证到期、登出和重放

**动作**：登出删除当前 session 并清 cookie；在测试库把 expiresAt 调到过去，重放旧 cookie；记录响应、session 记录和工单最终状态。对状态修改请求评估 CSRF 防护需求。

**原因**：只在浏览器删除 cookie 不会撤销服务端令牌；到期和登出必须让旧 token 再次使用时失败。

**产出**：会话生命周期和越权矩阵的验证记录。

**验证**：登出前受保护请求成功，登出/过期后同一 token 返回 \`401\`；错误所有者始终不能改变记录；公开日志只使用截断标识关联失败。

## 核心概念与取舍

- **认证与授权**：认证回答调用者身份，授权回答该身份对具体资源的操作。通过登录不等于拥有任意工单。
- **服务端 session 与自包含 token**：服务端 session 易于即时撤销和集中更新权限，代价是每次请求查存储；自包含 token 减少查找，但撤销和权限变化更复杂。当前 MVP 依据 ADR 选择前者。
- **密码哈希与加密**：密码验证不需要恢复原文，应使用带 salt 的慢哈希。实现与参数应遵循运行时和 OWASP Password Storage Cheat Sheet，而不是自创算法。
- **Cookie 属性**：HttpOnly 限制脚本读取，Secure 限制 HTTPS 传输，SameSite 影响跨站发送。它们缓解不同风险，不能互相替代。
- **401、403 与 404**：401 表示缺少有效身份；对具体对象的越权可返回 403，也可用 404 减少资源存在性泄露。团队必须统一并测试选择。
- **最小权限**：数据库用户、session 内容和路由上下文只拥有完成请求所需的权限/字段，减少单点泄露的影响面。
- **资料依据**：[Node.js crypto](https://nodejs.org/api/crypto.html)、[MDN Set-Cookie](https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) 与 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。

## 常见错误与诊断

### 错误 1：已登录用户可以修改他人工单

**症状**：用户 B 把 URL 中 id 换成用户 A 的工单 id 后更新成功。

**原因**：路由只调用了 requireUser，更新查询只按 ticket.id 过滤，没有 ownerId 条件。

**定位**：用两个用户执行同一 id 的矩阵测试，并查看实际 SQL/查询条件和影响行数。

**修复**：把 currentUser.id 加入读取/更新/删除条件；创建 ownerId 只取服务端会话；增加跨用户回归测试。

### 错误 2：本地登录成功但浏览器不保存 cookie

**症状**：登录返回成功，下一请求仍为 \`401\`，开发者工具中没有 cookie。

**原因**：在本地 HTTP 环境无条件设置 Secure、Domain 不匹配，或 fetch 没有发送同源凭据。

**定位**：检查登录响应 Set-Cookie、浏览器 cookie 拒绝原因、请求 Origin/协议和后续 Cookie 头；不要打印完整 token。

**修复**：生产 HTTPS 设置 Secure，本地开发按明确环境策略处理；省略不必要 Domain，保持 Path 与请求范围一致，并使用正确凭据模式。

### 错误 3：登出后旧 token 仍可使用

**症状**：浏览器显示已登出，但重放之前的 cookie 仍能访问受保护 API。

**原因**：只清了客户端 cookie，没有删除服务端 session，或认证查询没有检查 expiresAt。

**定位**：查询 session 记录，使用保存的测试 token 重放请求，并比较服务器时间与 expiresAt。

**修复**：登出同时删除服务端 session 和清 cookie；requireUser 每次检查到期；定期清理过期记录并测试重放失败。

## 完成检查

- [ ] 数据库和响应中都不存在明文密码，两个相同密码样例的存储哈希不同。
- [ ] session token 来自密码学安全随机源，有明确到期时间且不会完整进入日志。
- [ ] cookie 属性、生产 HTTPS 条件和 CSRF 剩余风险均已记录。
- [ ] 所有工单 CRUD 查询都包含 currentUser.id，客户端 ownerId 不能覆盖服务端归属。
- [ ] 未登录、正确所有者、错误所有者、过期、登出重放五类结果均有实际证据。

## 复盘与迁移

- **设计取舍**：为什么当前选择服务端 session 而不是自包含 token？说明放弃方案的优势、当前方案的存储成本和重新评估条件。
- **失败复盘**：选择一次 cookie、到期或对象级授权失败，指出哪个边界测试本可更早发现它。
- **迁移问题**：如果未来加入组织管理员角色，怎样在不散落条件判断的前提下扩展权限，同时保持默认拒绝和对象归属检查？`,
        exercises: [
          {
            slug: "s4-auth-ex1-session-flow",
            prompt: "提交注册、登录、受保护请求、过期、登出的时序图和会话表字段说明。标出密码哈希位置、token 生成/存储、cookie 的 HttpOnly/SameSite/Path/到期属性，以及生产 Secure 条件；再给出无 cookie、过期 token、登出后重放三种预期。不得提交真实密码或完整 token。",
            hints: [
              "定位：先把密码、session token、user id 分成三类数据，标明谁产生、谁存储、谁能读取。",
              "概念：cookie 保存的是随机 token，不是 passwordHash；服务端 session 保存 userId 和 expiresAt 才能撤销。",
              "路径：最后沿同一 token 走登录成功、过期和登出删除三个生命周期分支，分别写预期状态。",
            ],
            solution: "密码只在注册/登录请求中出现，注册用随机 salt 的慢哈希保存，登录验证后丢弃原文。服务端用安全随机源生成 token，session 表保存 token/userId/expiresAt，cookie 设置 HttpOnly、SameSite=Lax、Path=/ 和到期属性，生产 HTTPS 设置 Secure。无 cookie、未知/过期 token、登出后重放均返回 401；登出还需删除服务端 session 并清 cookie。",
            rubric: [
              "提交时序图区分密码、passwordHash、session token、userId 的产生者和存储位置",
              "提交中列出 HttpOnly、SameSite、Path、到期属性和生产 Secure 条件及各自目的",
              "提交中说明登出同时删除服务端 session 和清理客户端 cookie",
              "提交中给出无 cookie、过期 token、登出重放的预期 401，且没有真实秘密",
            ],
            answerType: "text",
          },
          {
            slug: "s4-auth-ex2-owner-guard",
            prompt: "提交一个更新工单的认证/授权代码片段：身份来自 requireUser，查询同时按 ticket.id 与 ownerId 过滤，客户端 body 中的 ownerId 被忽略。再提交用户 A 自有工单、用户 B 越权同一 id、不存在 id 三种预期状态与数据库结果。",
            hints: [
              "定位：先把 401 身份失败放在资源查询之前；有效 user.id 才能进入仓储函数。",
              "概念：仓储更新条件应一次包含目标 id 和 currentUser.id，不要先查 owner 再无条件更新。",
              "路径：比较越权和不存在对象的公开响应策略，但两者都必须保持影响行数为 0。",
            ],
            solution: `router.patch("/api/tasks/:id", requireUser, async (req, res, next) => {
  try {
    const updated = await updateTicket({ id: req.params.id, ownerId: req.user.id, text: req.body.text });
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "工单不存在" } });
    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

// updateTicket 的 WHERE 同时包含 ticket.id 与 ticket.ownerId；values 中不接受 ownerId。`,
            rubric: [
              "提交代码只从认证上下文读取当前 user.id，没有信任 body 中的 ownerId",
              "提交的更新查询在同一 WHERE 中同时约束 ticket.id 和 ownerId",
              "提交代码根据 returning/影响行数区分成功与无匹配，并保持数据库不变",
              "提交中分别给出自有、越权、不存在三种预期响应和数据库结果",
            ],
            answerType: "code",
          },
        ],
      },
      {
        terminalSteps: TERMINAL_STEPS["s4-testing-ci"],
        slug: "s4-testing-ci",
        title: "第四阶段第 3 课：测试策略与持续集成",
        orderIndex: 5,
        requiresPass: true,
        contentMarkdown: `# 第四阶段第 3 课：测试策略与持续集成

## 阶段位置与真实场景

工单系统已经有数据和权限边界，手工检查的组合迅速增长：不同用户、不同资源状态、数据库成功或失败都可能改变结果。本课把关键风险转为可重复证据，并让每次推送都在干净环境执行同一组类型检查、测试和构建。CI 不是绿色徽章，而是可追溯的拒绝机制。

## 学习目标

- 能够把工单系统的验收标准和风险映射到单元、集成、端到端三类测试，说明每类的观察边界（证据：练习 \`s4-testing-ex1-test-plan\`）。
- 能够使用固定输入、独立数据库和公开接口编写可重复测试，区分合法空结果、授权失败和系统错误（证据：练习 \`s4-testing-ex1-test-plan\` 的代表性用例）。
- 能够编写最小 GitHub Actions 工作流，在干净 Node.js 环境按锁文件安装并执行 typecheck、test、build，且用一次受控失败证明门禁有效（证据：练习 \`s4-testing-ex2-ci-workflow\`）。

## 前置条件

- 前两课的 API 契约、迁移、认证/授权矩阵和统一 npm 脚本已经存在。
- 仓库提交 \`package-lock.json\`，\`npm run typecheck\`、\`npm test\`、\`npm run build\` 在本地普通依赖目录可运行。
- 测试数据库与开发数据库分离，测试账号和工单均为虚构数据；测试不会连接生产服务。
- 了解函数输入输出、HTTP 请求/响应和 Git 分支/推送；不需要预先掌握 CI YAML。

## 本阶段交付物

- 一张“风险/验收 -> 测试层 -> 输入 -> 可观察断言 -> 未覆盖风险”的测试策略矩阵。
- 至少一个纯更新函数单元测试、一个迁移/seed 集成测试和一个授权 API 集成测试。
- 使用独立临时数据库、固定时间/随机值策略和统一清理的测试辅助代码。
- \`.github/workflows/ci.yml\`，包含最小权限、锁文件安装、typecheck、test、build。
- 一次先失败后修复的 CI 记录：失败断言/日志、根因、最小修复和重新运行结果。

## 实施步骤

### 步骤 1：从风险建立测试策略

**动作**：列出至少七个高风险行为：不可变切换、旧库迁移、重复 seed、合法空结果、未登录拒绝、跨用户拒绝、数据库系统错误；为每项选择最低成本且能观察真实行为的测试边界，写出独立预期。

**原因**：按文件或函数数量平均写测试会遗漏业务风险；先选行为边界可以避免对内部调用次数做脆弱断言。

**产出**：包含优先级、测试层和剩余风险的策略矩阵。

**验证**：每个验收至少映射一个测试；每个测试都能说明输入、公开操作和独立预期，没有“测试实现细节”或“快照全部对象”的模糊项。

### 步骤 2：先覆盖纯领域逻辑

**动作**：用 Vitest 测试 \`toggleTicket\`：给定两个固定 id，断言目标 done 翻转、非目标值保持、输入数组未被修改；再覆盖不存在 id 的结果。

**原因**：纯函数测试速度快、定位准，适合枚举边界；它不能证明数据库和 HTTP 接线，因此只承担领域规则证据。

**产出**：不依赖 DOM、网络、数据库或随机值的单元测试。

**验证**：先故意把预期 done 写错看见红灯，再恢复正确预期；重复运行结果一致，测试名称描述行为而不是 \`map\` 被调用。

### 步骤 3：用真实迁移和临时数据库测试持久化

**动作**：每个集成测试创建独立临时数据库，应用仓库生成迁移，通过公开 seed/仓储接口写入和读取；测试结束关闭连接并清理临时目录。覆盖旧 schema 升级和重复 seed。

**原因**：mock ORM 会跳过 SQL、默认值和约束，无法证明迁移；独立数据库既保留真实边界，又避免测试互相污染。

**产出**：可并行运行的迁移与 seed 集成测试。

**验证**：旧记录迁移后仍可读取，新字段有安全默认值；seed 连续运行记录数不增加且内容更新；测试失败后也执行清理。

### 步骤 4：通过公开 API 验证认证与授权

**动作**：在测试数据库准备用户 A/B 和 A 的工单，通过 Route Handler/HTTP 边界执行未登录、自有资源、越权、过期会话；只在 cookie/数据库等系统边界使用受控替身，不 mock 自己的业务函数。

**原因**：授权风险发生在身份、查询条件和响应的组合处，只测单个 guard 不能证明 ownerId 真正进入数据库操作。

**产出**：覆盖 \`401\`、成功、越权/不存在策略和数据库不变式的 API 集成测试。

**验证**：用户 B 的请求影响行数为 0，A 的记录保持不变；响应不含密码哈希、完整 token 或练习 solution。

### 步骤 5：建立最小 CI 工作流

**动作**：工作流在 pull request 和主分支 push 触发，设置 \`contents: read\`，依次 checkout、setup-node（使用项目 Node 主版本并启用 npm cache）、\`npm ci\`、typecheck、test、build。命令完全复用 package.json 脚本。

**原因**：\`npm ci\` 按锁文件创建干净依赖且发现锁文件漂移；复用脚本能减少“本地命令”和“CI 命令”分叉。最小权限降低工作流被利用后的影响。

**产出**：一份无需秘密即可验证代码的 CI YAML。

**验证**：使用工作流语法检查或首次 PR 运行确认每一步出现；日志显示 Node 版本和三项脚本，工作流没有写权限或真实数据库连接串。

### 步骤 6：证明门禁会失败并完成诊断

**动作**：在临时分支把一个独立预期改错或引入受控类型错误，推送观察 CI 红灯；记录失败步骤和首个有用错误，再恢复代码并重新运行。不要通过跳过测试或放宽断言修绿。

**原因**：从未见过失败的流水线可能没有运行目标测试，或错误被 \`continue-on-error\` 吞掉；受控失败验证门禁真实性。

**产出**：红灯、根因、修复和绿灯的可追溯记录。

**验证**：错误版本不能通过，修复版本通过同一工作流；没有更改门禁规则，失败日志不含 secret。

## 核心概念与取舍

- **测试层选择**：单元测试快且定位准，集成测试证明边界接线，端到端测试覆盖真实用户路径但更慢、更易受环境影响。用最低成本覆盖目标风险，不追求每层重复所有案例。
- **公开行为与实现细节**：通过 API/导出函数观察结果比断言内部函数调用次数更耐重构；只有外部服务、时间、随机数、文件系统等系统边界适合 mock。
- **确定性**：固定输入、隔离数据库、可控时间和显式清理让失败可复现。依赖测试顺序或共享开发库会制造偶发绿/红。
- **覆盖率与风险**：行覆盖率能发现未执行代码，不能证明断言有效；关键授权和迁移场景即使代码行少也应优先。
- **CI 与本地环境**：干净 runner 能发现未提交文件、锁文件和环境变量依赖；它不能替代生产监控或人工可用性审查。
- **资料依据**：[Vitest Guide](https://vitest.dev/guide/)、[GitHub Actions workflow syntax](https://docs.github.com/actions/writing-workflows/workflow-syntax-for-github-actions)、[setup-node](https://github.com/actions/setup-node) 与 [npm ci](https://docs.npmjs.com/cli/commands/npm-ci)。

## 常见错误与诊断

### 错误 1：测试单独通过，整套运行失败

**症状**：单文件绿色，全量测试因重复记录、端口占用或数据库关闭失败。

**原因**：测试共享数据库/全局状态，依赖执行顺序，或 finally 中没有清理连接和临时文件。

**定位**：随机或并行运行测试，记录每个测试的数据库路径和资源生命周期，检查失败前一项留下的状态。

**修复**：每个测试创建独立资源，使用固定夹具和 finally 清理；不要靠关闭并行掩盖状态泄漏。

### 错误 2：本地通过但 CI 找不到模块或文件

**症状**：CI 报缺少包、大小写不同的路径不存在，或生成文件未提交。

**原因**：本地 node_modules 含未声明依赖，锁文件未同步，或大小写不敏感文件系统隐藏了导入错误。

**定位**：检查 package.json/lock diff、CI 的 npm ci 输出和精确导入路径；在干净工作树重现。

**修复**：声明实际依赖并同步锁文件、修正路径大小写、提交必要生成物；不要把 node_modules 或本地缓存提交进仓库。

### 错误 3：CI 失败却仍显示整体成功

**症状**：测试步骤日志有失败，但工作流结论绿色或后续部署仍执行。

**原因**：使用 \`continue-on-error\`、管道吞掉退出码，或脚本在捕获错误后返回 0。

**定位**：查看失败命令的 exit code、步骤条件和 shell 管道；用受控错误验证 job 结论。

**修复**：移除非必要的错误忽略，确保 npm 脚本传播退出码，并让后续 job 显式依赖成功结果。

## 完成检查

- [ ] 测试策略矩阵覆盖不可变更新、迁移、seed、合法空结果、认证、对象授权和系统错误七类高风险行为。
- [ ] 单元测试不依赖外部状态，集成测试使用真实迁移和独立临时数据库。
- [ ] 授权 API 测试证明越权请求影响行数为 0，响应没有秘密或 solution。
- [ ] CI 使用锁文件、固定 Node 主版本、最小权限并执行 typecheck/test/build。
- [ ] 已保存一次受控红灯及同一工作流修复后绿灯的证据，没有放宽门禁。

## 复盘与迁移

- **设计取舍**：为什么授权场景选择 API+真实数据库集成测试，而不是只测 guard 或全部交给 E2E？说明放弃方案的速度/可信度差异。
- **失败复盘**：选择一次本地绿、CI 红或偶发失败，指出共享状态、环境差异或退出码中哪个证据定位了根因。
- **迁移问题**：如果未来把 CI 拆成并行 job 并加入部署，怎样共享构建产物而不重复信任未验证代码？`,
        exercises: [
          {
            slug: "s4-testing-ex1-test-plan",
            prompt: "提交一张测试策略矩阵，至少覆盖不可变切换、旧库迁移、重复 seed、合法空结果、未登录、跨用户访问、数据库系统错误七项风险。每行写测试层、固定输入、公开操作、独立预期和未覆盖风险；明确区分空数组、授权失败响应与 500 错误，再选择跨用户访问写出完整 Arrange/Act/Assert。",
            hints: [
              "定位：先问哪一个最低层级能观察真实风险：纯函数不需要数据库，迁移、ownerId 查询、合法空结果和数据库失败需要真实边界。",
              "概念：预期使用已知字面值、状态码和数据库不变式，不要用与实现相同的算法计算 expected。",
              "路径：空库读取应是成功空数组，数据库故障应是 500 错误对象；跨用户用 A/B 和 A 的固定工单，同时断言拒绝响应与数据库未变化。",
            ],
            solution: "矩阵示例：切换用单元测试断言目标 done 与输入不变；旧库迁移用真实迁移断言旧记录和默认值；seed 连跑两次断言计数不增且内容刷新；空库 GET 断言 200 与 []；未登录 API 断言 401；用户 B 更新 A 工单断言约定的 404/403 且 A 记录不变；受控数据库失败断言 500 错误对象且不是 []。跨用户 Arrange 创建 A/B 与 A-ticket，Act 以 B session PATCH 固定 id，Assert 响应拒绝、影响行数 0、重新以 A 查询内容未变。",
            rubric: [
              "提交矩阵包含七项指定风险及对应测试层、固定输入、公开操作和独立预期",
              "提交中用状态码和响应形状明确区分合法空结果、授权失败与数据库系统错误",
              "提交中说明每项为什么不选择更低或更高成本的测试层",
              "跨用户 Arrange 使用两个固定用户和明确归属的固定工单",
              "跨用户 Assert 同时覆盖公开响应和数据库记录保持不变",
            ],
            answerType: "text",
          },
          {
            slug: "s4-testing-ex2-ci-workflow",
            prompt: "提交最小 GitHub Actions CI YAML：在 pull_request 和主分支 push 触发，contents 只读，setup-node 使用项目 Node 主版本与 npm cache，依次 npm ci、typecheck、test、build。再提交一次受控失败的预期步骤、禁止的修绿方式和修复后复跑证据格式。",
            hints: [
              "定位：先让 workflow 只做验证，不加入部署、写权限或生产 secrets。",
              "概念：checkout 后 setup-node，再 npm ci；三个验证命令复用 package.json scripts 并让失败退出码终止 job。",
              "路径：受控失败可以改错独立预期，修复时恢复业务/测试正确性，不能加 continue-on-error 或删除断言。",
            ],
            solution: `name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build`,
            rubric: [
              "提交 YAML 同时包含 pull_request、main push 和 contents: read",
              "提交 YAML 按 checkout、固定 Node/npm cache、npm ci、typecheck、test、build 排序",
              "提交中明确失败命令必须终止 job，未使用 continue-on-error 掩盖失败",
              "提交中记录受控红灯、首个有用错误、最小修复和同一工作流复跑结果格式",
            ],
            answerType: "code",
          },
        ],
      },
      {
        slug: "s4-docker-deployment",
        terminalSteps: TERMINAL_STEPS["s4-docker-deployment"],
        title: "第四阶段第 4 课：Docker 部署与运行维护",
        orderIndex: 6,
        requiresPass: true,
        contentMarkdown: `# 第四阶段第 4 课：Docker 部署与运行维护

## 阶段位置与真实场景

代码已经通过 CI，但目标环境仍可能缺少正确 Node.js 版本、环境变量、数据库或迁移。最后一课把应用构建成不可变镜像，用 Compose 在本地复现应用与 PostgreSQL 拓扑，并形成“发布前检查 -> 迁移 -> 部署 -> 健康验证 -> 观察 -> 回滚”的运行手册。部署完成必须有外部证据，不能只凭构建成功推断线上可用。

## 学习目标

- 能够编写可缓存的多阶段 Dockerfile 和 \`.dockerignore\`，让运行镜像只包含生产所需文件并使用非 root 用户（证据：练习 \`s4-deploy-ex1-dockerfile\`）。
- 能够用 Compose 通过服务名连接应用与 PostgreSQL，区分配置、秘密、健康检查和持久化卷（证据：练习 \`s4-deploy-ex1-dockerfile\` 的 Compose 文件与本地验证记录）。
- 能够设计兼容迁移、部署验证、观察和回滚运行手册，并明确哪些证据必须实际访问目标环境后才能声明（证据：练习 \`s4-deploy-ex2-release-runbook\`）。

## 前置条件

- 第四阶段前 3 课的 API、权限测试和 CI 均通过，工作树干净并有可追踪提交 SHA。
- 安装 Docker Engine/Desktop 与 Compose 插件；执行 \`docker version\`、\`docker compose version\` 能成功，不需要在本仓库安装 npm 依赖。
- 准备不含真实秘密的 \`.env.example\` 和本地开发 \`.env\`；真实部署秘密由目标平台注入，不写入镜像或 Git。
- 准备专用测试/预发布数据库和备份/恢复方法；本课不得拿生产数据练习破坏性迁移。

## 本阶段交付物

- 多阶段 Dockerfile、\`.dockerignore\`、镜像标签规则和镜像元数据记录。
- Compose 文件：应用、PostgreSQL、命名卷、健康依赖和非秘密配置。
- \`/health/live\`、\`/health/ready\` 的语义说明与外部检查命令。
- 包含备份、兼容迁移、部署、冒烟、观察、回滚、恢复的发布运行手册。
- 一次本地 Compose 启停证据和一次目标环境发布证据；无法访问的外部状态明确标为“未验证”。

## 实施步骤

### 步骤 1：冻结运行时契约与发布标识

**动作**：列出进程必须的端口、\`NODE_ENV\`、\`DATABASE_URL\`、会话配置和健康端点；选择不可变镜像标签（提交 SHA）并保留可读版本标签作为别名。

**原因**：容器只打包文件，不会自动提供数据库和秘密；先写运行时契约可以避免把本地默认值误带入目标环境。不可变标签让回滚指向确定字节。

**产出**：环境变量清单、端口/健康契约和镜像命名规则。

**验证**：每个必需变量都有是否秘密、提供者、缺失行为；运行手册使用 SHA 标签而不是只用 \`latest\`。

### 步骤 2：构建最小且可重复的镜像

**动作**：\`.dockerignore\` 排除 \`node_modules\`、\`.git\`、\`.env*\`、日志、测试输出；Dockerfile 先复制 package/lock 并 \`npm ci\`，再复制源码构建，运行阶段只复制生产产物和裁剪后的生产依赖，使用非 root 用户启动。

**原因**：先复制锁文件能复用依赖层；排除秘密和宿主依赖减小构建上下文；多阶段构建避免编译工具进入运行镜像；非 root 降低进程被利用后的权限。

**产出**：从干净上下文构建的应用镜像。

**验证**：\`docker build --pull -t ticket-api:<sha> .\` 成功；\`docker image inspect\` 显示非 root 用户和预期标签；在不注入数据库配置时容器明确失败而不是静默使用生产默认值。

### 步骤 3：用 Compose 复现服务拓扑

**动作**：定义 \`app\` 和 \`db\` 服务；app 的 \`DATABASE_URL\` 主机使用 Compose 服务名 \`db\` 而不是 localhost；db 使用命名卷和健康检查，app 在数据库健康后启动。非秘密配置可写 compose，密码从本地 env/secret 注入。

**原因**：容器内 localhost 指向容器自身；服务名由 Compose 网络解析。健康依赖减少“进程已启动但数据库尚未接收连接”的竞态，但应用仍需重试暂时错误。

**产出**：一条命令可启动/停止的本地应用与数据库环境。

**验证**：仅用不含真实秘密的 \`.env.example\` 执行 \`docker compose --env-file .env.example config\` 并审查服务名、健康依赖和卷；不要在加载真实秘密的 shell 中捕获展开配置。随后用本地开发秘密执行 \`docker compose up -d\`，确认两服务健康、应用容器能解析 \`db\`，宿主可通过映射端口访问 API；证据只记录键名和脱敏结果。

### 步骤 4：把迁移设计为兼容发布步骤

**动作**：发布前备份并验证恢复路径；在预发布数据库应用迁移。对删列/改名使用 expand-and-contract：先新增兼容字段并发布双读/双写，回填验证后再在后续版本删除旧字段。确保迁移只由一个受控 job 执行。

**原因**：应用滚动更新时新旧版本可能同时运行，破坏性迁移会让其中一个版本立即失败；多副本同时迁移还可能竞争锁或重复操作。

**产出**：有前置检查、单执行者、兼容窗口和回退条件的迁移步骤。

**验证**：旧应用版本在 expand 迁移后仍能工作；新版本读写通过；回填行数与预期一致；在演练库实际完成一次恢复。

### 步骤 5：部署并从外部验证

**动作**：先检查 CI、镜像 digest、配置和备份，再运行迁移与部署；从目标环境外部请求 liveness、readiness、登录和受保护工单读取。记录 URL、时间、状态码、响应摘要和版本标识。

**原因**：容器 Running 只说明进程存在，不能证明数据库连接、迁移、路由、TLS 或外部网络正常；外部冒烟检查覆盖真实入口。

**产出**：可追踪到镜像 SHA 的发布和冒烟记录。

**验证**：liveness 证明进程响应，readiness 同时检查必要依赖；登录和自有工单请求符合契约；未实际访问的 URL 标为未验证，不由 AI 或日志替代。

### 步骤 6：观察、回滚并复盘

**动作**：在观察窗口查看错误率、延迟、重启次数、数据库连接和磁盘；达到阈值时停止扩容/流量，回滚到上一 SHA。若 schema 仍向后兼容只回滚应用；若数据已破坏，按演练过的恢复手册处理并保留事件记录。

**原因**：没有阈值的“观察一下”无法触发动作；镜像回滚不能自动撤销数据迁移，错误的向下迁移可能造成第二次损失。

**产出**：监控证据、明确决策点、回滚/恢复结果和复盘行动项。

**验证**：在预发布演练一次应用回滚，确认旧版本 readiness 恢复；记录恢复时间、数据一致性检查和后续修复负责人。

## 核心概念与取舍

- **镜像与容器**：镜像是不可变构建产物，容器是其运行实例。登录容器手改文件不能形成可重复发布，修复应进入源码和新镜像。
- **多阶段构建**：分离依赖/构建/运行阶段能减少运行面和镜像体积，代价是 Dockerfile 更复杂，需要明确哪些产物必须复制。
- **配置与秘密**：普通配置也应环境化；密码、令牌、私钥是秘密，不能进入 ARG、ENV 层、镜像或日志。目标平台负责安全注入与轮换。
- **liveness 与 readiness**：liveness 判断进程是否需要重启，readiness 判断实例是否能接流量。把暂时数据库故障当 liveness 失败可能制造重启风暴。
- **迁移与回滚**：应用二进制容易回滚，数据状态不一定可逆；向后兼容的 expand-and-contract 用额外发布换取安全窗口。
- **Compose 与生产编排**：Compose 适合本地复现多服务拓扑，不自动提供生产高可用、滚动发布、秘密管理或备份。
- **资料依据**：[Dockerfile overview](https://docs.docker.com/build/concepts/dockerfile/)、[multi-stage builds](https://docs.docker.com/build/building/multi-stage/)、[Compose networking](https://docs.docker.com/compose/how-tos/networking/)、[Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) 与 [Docker secrets](https://docs.docker.com/engine/swarm/secrets/)。

## 常见错误与诊断

### 错误 1：应用容器连接 localhost 数据库失败

**症状**：应用日志显示 \`ECONNREFUSED 127.0.0.1:5432\`，但 db 容器健康。

**原因**：容器内 localhost 是应用容器自身，不是 Compose 中的数据库服务。

**定位**：检查容器内 \`DATABASE_URL\` 的主机部分、\`docker compose ps\` 和服务网络；从 app 容器解析服务名 \`db\`。

**修复**：把连接主机改为 Compose 服务名 \`db\`，保留 PostgreSQL 容器端口；只有宿主访问才使用映射端口。

### 错误 2：容器已运行但请求持续 500

**症状**：\`docker compose ps\` 显示 Up，外部 API 返回 500 或 readiness 失败。

**原因**：进程存在但缺少环境变量、迁移未应用或数据库尚不可用；只检查容器状态没有检查依赖。

**定位**：查看 readiness 响应、按请求 id 关联应用日志，检查迁移版本和数据库健康；不要把完整环境变量输出到日志。

**修复**：补齐配置并重新创建容器，按运行手册单独执行迁移；为暂时连接失败增加有上限的重试，保持 readiness 失败直到依赖可用。

### 错误 3：回滚镜像后旧版本因新 schema 崩溃

**症状**：切回上一 SHA 后路由报列不存在或数据形状不兼容。

**原因**：发布前执行了破坏性删列/改名，没有保留旧版本兼容窗口。

**定位**：比较新旧应用使用的列和实际 schema 版本，查看迁移 SQL 是否包含 DROP/RENAME 和回填步骤。

**修复**：恢复兼容 schema 或按备份恢复数据；后续改用 expand-and-contract，在确认旧版本不再运行后才收缩字段。

## 完成检查

- [ ] 构建上下文排除依赖、Git、env 和测试输出，镜像以非 root 用户运行并用 SHA 标记。
- [ ] Compose 中应用通过服务名连接健康数据库；只保存由非秘密示例配置生成的 config，真实秘密不出现在证据、镜像历史或 Git。
- [ ] 迁移有备份、单执行者、预发布验证、兼容窗口和数据恢复演练。
- [ ] liveness、readiness、登录和自有工单从外部入口获得实际状态码与版本证据。
- [ ] 观察阈值、上一稳定 SHA、应用回滚和数据恢复条件均写入运行手册。
- [ ] 无法访问或没有执行的生产检查明确标为未验证。

## 复盘与迁移

- **设计取舍**：为什么选择多阶段镜像和 expand-and-contract，而不是单阶段镜像与一次性改表？说明复杂度成本和被放弃方案的风险。
- **失败复盘**：选择一次构建、启动、迁移或 readiness 失败，指出哪项发布前检查本可更早发现它。
- **迁移问题**：如果从单机 Compose 迁移到多副本编排平台，session、迁移单执行者、readiness 和持久化卷分别需要怎样调整？`,
        exercises: [
          {
            slug: "s4-deploy-ex1-dockerfile",
            prompt: "提交工单 API 的多阶段 Dockerfile、.dockerignore 和 Compose 文件：镜像按锁文件安装、构建、裁剪依赖并以非 root 启动；Compose 的 app 通过服务名 db 连接 PostgreSQL，包含命名卷、数据库健康检查和 service_healthy 依赖。附上 SHA 标签、inspect 用户结果、使用非秘密 .env.example 的 config 检查、Compose 启停证据和缺少 DATABASE_URL 时的预期失败；不要粘贴真实秘密或展开真实环境配置。",
            hints: [
              "定位：先单独复制 package.json 与 lockfile 执行 npm ci，再复制源码，才能复用依赖缓存层。",
              "概念：构建阶段完成编译并 prune --omit=dev，运行阶段只复制 dist/package/生产 node_modules；随后画出 app、db、命名卷和健康依赖。",
              "路径：DATABASE_URL 的主机必须是 db；只用明确标为示例的假值运行 config 检查，真实秘密只在启动时注入且不进入保存的输出。",
            ],
            solution: `FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

# compose.yaml 摘要：
# db 使用 postgres 镜像、tickets-data 命名卷和 pg_isready healthcheck；
# app.image 使用 ticket-api:\${IMAGE_TAG:?set IMAGE_TAG}，并通过
# DATABASE_URL=postgres://ticket:<password>@db:5432/tickets 连接服务名 db；
# app.depends_on.db.condition 使用 service_healthy。
# .env.example 只放 example-only 假值，用于 docker compose --env-file .env.example config；
# 真实密码只在启动时注入，不捕获或提交真实环境的展开配置。
# .dockerignore 至少包含 node_modules、.git、.env*、*.log、coverage。`,
            rubric: [
              "提交 Dockerfile 在复制源码前按 lockfile 安装依赖，并在构建阶段生成产物",
              "提交运行阶段只复制 package、生产依赖和构建产物，且使用非 root 用户",
              "提交 .dockerignore 排除 node_modules、.git、.env、日志和测试输出",
              "提交 Compose 文件让 app 通过服务名 db 连接含健康检查和命名卷的数据库，并等待 service_healthy",
              "提交中包含不可变 SHA 标签、inspect 用户、非秘密示例 config 与 Compose 启停证据、缺少必需配置的预期结果且没有秘密",
            ],
            answerType: "code",
          },
          {
            slug: "s4-deploy-ex2-release-runbook",
            prompt: "提交一份发布/回滚运行手册：前置 CI 与镜像校验、备份恢复演练、兼容迁移单执行者、部署、外部 liveness/readiness/登录/工单冒烟、观察阈值、回滚到上一 SHA 和数据恢复条件。为每步写命令或检查、预期、证据位置和停止条件，并标出当前无法实际验证的项。",
            hints: [
              "定位：先区分应用镜像回滚和数据库恢复；二者触发条件、风险和执行时间不同。",
              "概念：健康检查从目标环境外部执行，并记录版本标识；容器 Up 不能替代 readiness。",
              "路径：每个步骤都需要停止条件，例如迁移行数异常、错误率超过阈值或旧版本不兼容新 schema。",
            ],
            solution: "运行手册顺序：确认同一 SHA 的 CI 和镜像 digest；验证备份可恢复；在预发布应用兼容迁移；由单 job 在目标执行；部署 SHA；从外部检查 live/ready、登录、自有工单；观察错误率/延迟/重启/连接。迁移异常立即停止且不部署；应用指标超阈值回滚上一 SHA；只有数据损坏才按演练备份恢复。每步记录时间、操作者、命令、预期和实际结果，未访问生产则标记未验证。",
            rubric: [
              "提交运行手册按 CI/镜像、备份、迁移、部署、外部冒烟、观察、回滚排序",
              "每个步骤都包含检查或命令、独立预期、证据位置和明确停止条件",
              "提交中区分应用回滚与数据恢复，并说明兼容迁移为何允许旧 SHA 回滚",
              "提交中明确标记未执行/无法访问项，没有把构建日志当作线上验证",
            ],
            answerType: "text",
          },
        ],
      },
    ],
    projects: [
      {
        slug: "p1-static-page",
        title: "项目 1：工单系统静态项目说明页",
        description: "用 HTML/CSS、Git 和静态发布完成工单系统项目说明页，建立后续看板迭代的需求基线。",
        orderIndex: 0,
        tasks: [
          "用 git 管理代码，至少 2 个 commit",
          "页面展示工单系统名称、目标用户、核心流程和一个可访问的项目链接",
          "发布到一个可访问的 URL，并在提交记录中保留发布版本",
          "在 README 写出本地运行命令、预期页面标题和需求基线位置",
        ],
        acceptanceCriteria: [
          "提交中包含一个以 http:// 或 https:// 开头的发布地址",
          "仓库包含 HTML、CSS 和 README 文件，且 git log 至少显示 2 个提交",
          "README 同时包含本地运行命令、预期页面标题和最小 PRD 文件路径",
        ],
        guideMarkdown: "# 项目指南\n\n## 目标\n交付一个工单系统静态项目说明页，形成项目 2 的需求基线。\n\n## 前置条件\n已安装浏览器、编辑器和 Git；能在终端进入项目目录并查看 `git status`。\n\n## 项目步骤\n1. **写最小 PRD**：先记录用户、问题、范围和验收标准；原因是后续看板变更必须有可追溯基线；产出是 `docs/ticket-prd.md`；验证是逐项检查四个字段均非空。\n2. **实现说明页**：用 HTML/CSS 呈现工单名称、目标用户、核心流程和项目链接；原因是页面把需求变成可观察界面；产出是源码；验证是浏览器标题、正文和链接均可见。\n3. **提交并发布**：至少创建两次有意义的 Git 提交并发布页面；原因是保留变更边界和可访问证据；产出是提交记录与 URL；验证是 `git log` 和无登录访问 URL。\n4. **整理 README**：写本地运行命令、预期标题和 PRD 路径；原因是他人需要复现基线；产出是 README；验证是按命令启动并核对标题。\n\n## 常见错误\n- 症状：发布页显示旧标题；原因：发布版本不是最新提交；定位：比较 `git log` 与发布记录；修复：重新发布最新 SHA。\n- 症状：链接点击后 404；原因：相对路径或部署基路径错误；定位：浏览器网络面板和链接 href；修复：改为正确相对路径并重新验证。\n\n## 最小 PRD 模板\n```markdown\n# 工单系统需求基线\n- 标题：\n- 用户：\n- 问题：\n- 范围（包含/不包含）：\n- 验收标准：\n  - [ ] 页面显示工单名称与目标用户\n  - [ ] 核心流程可被文字或链接说明\n- 被放弃方案与原因：\n```\n\n## 模板说明\n复制模板到 `docs/ticket-prd.md`，后续需求变更必须引用它并先提交影响分析。",
        deliverables: ["静态项目说明页源码仓库", "最小 PRD 与需求基线", "包含本地运行说明的 README", "发布地址与提交记录"],
        rubric: createProjectRubric({
          implementation: "页面包含工单名称、目标用户、核心流程和项目链接",
          verification: "PRD、README、发布地址与至少 2 个提交记录",
          decisionRecord: "PRD 中记录范围、验收标准和一个被放弃方案",
        }),
        sandbox: { runtime: "static" },
        ...PROJECT_TESTS["p1-static-page"],
        reflectionQuestions: [
          "解释一个关键设计决策以及你放弃的方案，为什么当前方案更适合这个项目？",
          "复盘一次实现或发布失败：你如何定位问题，下次会怎样迁移这套排查方法？",
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
          "在已有看板上增加 high、medium、low 三档工单优先级",
          "编码前提交需求变更影响分析，并迁移旧 localStorage 数据",
        ],
        acceptanceCriteria: [
          "添加工单后可完成、删除，并可按完成状态筛选",
          "新建工单可选择 high、medium、low，列表显示所选优先级",
          "载入不含 priority 的旧 localStorage 工单后，该工单显示 medium，刷新后仍存在",
          "git log 显示影响分析提交早于首个包含优先级实现的代码提交",
        ],
        guideMarkdown: "# 项目指南\n\n## 目标\n在已有原生 JavaScript 看板上完成第一次需求变更：为工单加入 high、medium、low 三档优先级，并保留旧数据。\n\n## 前置条件\n已完成项目 1 的 PRD 基线，已有可添加、完成、删除、筛选并写入 localStorage 的看板。\n\n## 需求变更任务\n编码前先提交影响分析，列出数据模型、输入、渲染、筛选、持久化、旧 localStorage 数据迁移和回滚影响；不得从零重写看板。\n\n## 项目步骤\n1. **记录变更**：更新 PRD 并提交影响分析；原因是先锁定范围和兼容策略；产出是变更文档；验证是该提交早于优先级代码提交。\n2. **迁移读取边界**：读取旧工单时为缺失 priority 的记录补 medium，再保存新结构；原因是避免已有工单消失；产出是兼容加载逻辑；验证是导入旧 JSON、刷新并核对标题与优先级。\n3. **贯通交互与渲染**：创建时选择 high、medium、low，列表显示优先级；原因是数据只有可输入和可观察才形成完整行为；产出是界面与状态更新；验证是分别新建三条工单。\n4. **回归原行为**：验证添加、完成、删除、状态筛选和刷新恢复；原因是需求变更不能破坏已有能力；产出是验证记录；验证是逐条记录输入、动作、预期和实际结果。\n\n## 常见错误\n- 症状：旧工单渲染为空；原因：代码假定 priority 必然存在；定位：检查 localStorage 原始 JSON；修复：在读取边界补默认 medium。\n- 症状：界面显示优先级但刷新后丢失；原因：save 未写入新字段；定位：比较内存状态与存储 JSON；修复：统一序列化完整工单。\n\n## 需求变更与影响分析模板\n\x60\x60\x60markdown\n# 变更请求：工单优先级\n- 基线版本：\n- 新行为与不变行为：\n- 影响范围：数据模型 / 输入 / 渲染 / 筛选 / 持久化\n- 旧数据迁移：缺少 priority 时写入 medium\n- 验证场景：\n- 被放弃方案与原因：\n- 风险与回滚：\n\x60\x60\x60\n\n## 模板说明\n复制模板后先提交文档，再开始编码；验证记录必须覆盖旧数据迁移与所有原有操作。",
        deliverables: ["原生 JavaScript 看板源码", "更新后的 PRD", "需求变更与编码前影响分析", "旧 localStorage 数据迁移验证记录", "原有行为回归记录"],
        rubric: createProjectRubric({
          implementation: "源码贯通 high、medium、low 的输入、状态、渲染与存储",
          verification: "影响分析、旧数据迁移及原有行为回归记录",
          decisionRecord: "影响分析中说明默认 medium、替代方案和回滚条件",
        }),
        sandbox: { runtime: "static" },
        ...PROJECT_TESTS["p2-vanilla-board"],
        reflectionQuestions: [
          "解释状态持久化的设计决策以及你放弃的方案，为什么选择当前边界？",
          "如果旧 localStorage 数据迁移失败，你会如何定位、恢复并避免再次发生？",
        ],
      },
      {
        slug: "p3-react-board",
        title: "项目 3：React 版任务看板",
        description: "把含工单优先级的原生看板迁移到 React 组件与状态边界，并用 ADR 和脚手架测试保存迁移证据。",
        orderIndex: 2,
        tasks: [
          "React 组件拆分（Task/Board）",
          "状态放父组件，事件向上",
          "把工单优先级迁移到 Task 类型、输入组件、列表组件和父级状态",
          "提交组件边界 ADR",
          "使用项目脚手架提供的测试命令完成优先级回归测试",
        ],
        acceptanceCriteria: [
          "Task 类型包含 high、medium、low 的 priority 字段，父组件保存工单数组并通过 props 向下传递",
          "创建 high、medium、low 工单后，列表分别显示对应优先级，完成与删除回调仍使用工单 id",
          "提交的 ADR 包含状态、背景、决策、至少一个被放弃方案和后果",
          "提交脚手架测试命令、退出码 0 和覆盖优先级显示及回调的测试名称",
        ],
        guideMarkdown: "# 项目指南\n\n## 目标\n将项目 2 的优先级需求迁移到 React 的组件、props 和父级状态边界，同时保持原有行为。\n\n## 前置条件\n已完成项目 2，保留含 priority 的工单样例、旧数据迁移规则与回归记录；项目脚手架已提供测试命令和示例测试。\n\n## 项目步骤\n1. **盘点迁移边界**：列出原生版状态、事件和持久化职责；原因是迁移不是重写业务规则；产出是映射表；验证是每项旧职责都对应一个 React 边界。\n2. **先写组件边界 ADR**：决定 Board、TicketForm、TicketList、TicketItem 的状态与 props；原因是让优先级只有一个事实来源；产出是 ADR；验证是模板字段齐全且记录被放弃方案。\n3. **迁移优先级**：在 Task 类型、创建输入、父级状态和列表展示中贯通 priority；原因是防止字段只存在于界面；产出是 React 实现；验证是创建三档工单并完成、删除各一条。\n4. **运行脚手架测试**：使用仓库提供的测试命令，不要求学习者自行搭建测试框架；原因是第四阶段测试课尚未完成；产出是测试报告；验证是记录命令、测试名和退出码 0。\n5. **回归持久化**：继续兼容项目 2 的旧 localStorage 数据；原因是框架迁移不能丢失用户数据；产出是迁移记录；验证是载入无 priority 数据并观察默认 medium。\n\n## 常见错误\n- 症状：修改优先级后列表不更新；原因：直接修改对象或在子组件复制 props；定位：检查 React DevTools 中父级状态；修复：用 id 创建不可变的新数组。\n- 症状：测试命令不存在；原因：脱离脚手架另起配置；定位：检查 package.json scripts；修复：恢复脚手架并使用提供的测试方式。\n\n## ADR 模板\n\x60\x60\x60markdown\n# ADR：React 工单组件边界\n- 状态：提议 / 接受 / 废弃\n- 背景：\n- 决策：状态归属、props 与事件回调\n- 被放弃方案：\n- 后果：收益、代价与后续触发条件\n- 验证证据：\n\x60\x60\x60\n\n## 模板说明\n在编码前填写并提交 ADR；测试报告只陈述实际运行的脚手架命令与输出，不把未运行的检查写成通过。",
        deliverables: ["React 看板源码", "组件边界 ADR", "脚手架测试报告", "优先级迁移与回归记录", "原生 JavaScript 与 React 边界对比"],
        rubric: createProjectRubric({
          implementation: "Task 类型、父级状态、props、输入与列表贯通 priority",
          verification: "三档优先级行为、旧数据兼容和脚手架测试报告",
          decisionRecord: "ADR 记录组件边界、被放弃方案与可观察后果",
        }),
        sandbox: { runtime: "node" },
        ...PROJECT_TESTS["p3-react-board"],
        reflectionQuestions: [
          "解释组件边界的设计决策以及你放弃的方案，这个取舍带来了什么影响？",
          "复盘从原生 JavaScript 迁移到 React 时的一次失败，你会如何降低下一次迁移风险？",
        ],
      },
      {
        slug: "p4-fullstack-board",
        title: "项目 4：全栈工单系统",
        description: "完成 React、Node/Express、PostgreSQL、认证授权、测试与部署闭环，并让工单优先级贯穿各层契约。",
        orderIndex: 3,
        tasks: [
          "定稿 PRD，并在编码前提交工单优先级的全栈影响分析",
          "用 Mermaid ER 图和迁移定义含 priority 的 PostgreSQL 工单表",
          "用 OpenAPI 风格契约定义含 priority 的 REST CRUD 与统一错误响应",
          "前端贯通 API，并实现登录、工单所有者权限和 403 响应",
          "提交 ADR、测试报告、CI 证据、部署记录和回滚步骤",
        ],
        acceptanceCriteria: [
          "数据库迁移创建非空 priority 列，并约束值为 high、medium、low",
          "创建、读取、更新工单的 API 请求与响应均包含 priority，非法值返回 400 和统一错误对象",
          "已登录用户只能读写自己的工单，对另一用户工单的更新请求返回 403",
          "自动测试报告包含 CRUD、priority 校验、401、403 和数据库迁移测试，且记录退出码 0",
          "部署记录包含不可变 SHA、迁移结果、外部健康检查与回滚步骤",
        ],
        guideMarkdown: "# 项目指南\n\n## 目标\n交付可部署的全栈工单系统，让项目 2 引入、项目 3 迁移的 priority 贯通数据库、API、权限、测试和部署。\n\n## 前置条件\n项目 3 的 React 看板、组件边界 ADR 与优先级回归记录已完成；能够使用 PostgreSQL 迁移、会话认证、自动测试、CI 和 Docker 部署课程中的脚手架。\n\n## 需求变更任务\n编码前定稿 PRD 并提交全栈影响分析，逐层列出 priority 的数据库约束、API 兼容、前端状态、所有者权限、测试夹具、部署迁移和回滚影响。\n\n## 项目步骤\n1. **锁定交付契约**：定稿 PRD、影响分析、ER 图、API 契约和 ADR；原因是数据库与 API 变更需要共同事实来源；产出是文档集；验证是字段、枚举和错误响应在各文档一致。\n2. **迁移数据库**：添加非空 priority 与 high、medium、low 约束，并为旧行回填 medium；原因是保留旧数据且拒绝非法状态；产出是可回滚迁移；验证是迁移前后行数一致且约束拒绝非法值。\n3. **贯通 API 与权限**：CRUD 序列化 priority，并在资源查询中绑定当前用户；原因是新字段不能绕过所有者边界；产出是路由与统一错误；验证是 400、401、403 和所有者成功路径。\n4. **对接 React 前端**：从 API 加载和修改优先级；原因是服务端成为持久化事实来源；产出是全链路界面；验证是刷新后仍显示所选优先级。\n5. **形成测试与 CI 证据**：覆盖迁移、CRUD、非法优先级、认证和权限；原因是跨层变更回归面扩大；产出是测试报告与 CI 链接；验证是记录命令、用例名、SHA 和退出码 0。\n6. **部署并记录回滚**：按同一 SHA 构建镜像、执行迁移、外部健康检查并演练应用回滚；原因是构建成功不等于线上可用；产出是部署记录；验证是外部检查返回版本标识，未执行项明确标记无法验证。\n\n## 常见错误\n- 症状：部署后旧工单读取失败；原因：非空列没有回填；定位：检查迁移顺序和旧行；修复：先加可空列、回填 medium、再加约束。\n- 症状：登录用户可修改他人工单；原因：只按工单 id 更新；定位：用两个用户执行 403 测试；修复：查询和更新同时约束 owner id。\n- 症状：API 文档和响应枚举不同；原因：契约未随实现更新；定位：比较 OpenAPI 示例与契约测试；修复：先更新契约再同步实现。\n\n## Mermaid ER 图模板\n\x60\x60\x60mermaid\nerDiagram\n  USER ||--o{ TICKET : owns\n  TICKET {\n    uuid id PK\n    uuid owner_id FK\n    string title\n    string priority \"high|medium|low\"\n  }\n\x60\x60\x60\n\n## OpenAPI 风格 API 契约模板\n\x60\x60\x60yaml\nopenapi: 3.1.0\npaths:\n  /tickets/{id}:\n    patch:\n      requestBody:\n        content:\n          application/json:\n            schema:\n              properties:\n                priority:\n                  type: string\n                  enum: [high, medium, low]\n      responses:\n        '200': { description: 工单含 priority }\n        '400': { description: 非法 priority }\n        '403': { description: 非所有者 }\n\x60\x60\x60\n\n## 模板说明\n复制模板并补全字段、状态码和错误对象；ER 图、迁移、API 契约与实现中的 priority 命名必须一致。ADR 沿用项目 3 模板，增加数据库选型、认证边界与迁移回滚决策。",
        deliverables: ["全栈工单系统源码", "PRD 定稿与优先级影响分析", "Mermaid ER 图", "OpenAPI 风格 API 契约", "架构决策记录 ADR", "测试报告", "CI 运行证据", "部署与回滚记录"],
        rubric: createProjectRubric({
          implementation: "数据库、API、权限和 React 前端一致贯通 priority",
          verification: "迁移、CRUD、400、401、403、测试、CI 和部署记录",
          decisionRecord: "PRD、ER、API 契约与 ADR 记录替代方案和回滚条件",
        }),
        sandbox: { runtime: "node" },
        ...PROJECT_TESTS["p4-fullstack-board"],
        reflectionQuestions: [
          "解释数据库或 API 的关键设计决策以及你放弃的方案，证据如何支持当前选择？",
          "如果数据库迁移或全链路验证失败，你会怎样定位影响范围并安全恢复？",
        ],
      },
    ],
  },
];
