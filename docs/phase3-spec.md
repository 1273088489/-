# Phase 3 — AI 学习助手与平台体验完善

> 状态：DRAFT — 规划中（2026-08-14）
> 本文件定义 Phase 3 的范围与分票依据。

## 1. 目标

在现有 Quanzhan 学习平台（Phase 1 基础教学 + Phase 2 仓库接入/沙箱执行/证据化评分/补课路径）基础上，新增：

1. **AI 浮窗助手**：全站悬浮的 AI 问答助手，用户随时点击打开，输入问题获得 AI 解答。
2. **课程内容与项目页面完善**：确保 S3（React）和 S4（Fullstack）课时内容、项目页面、练习体验完整交付。
3. **学习仪表盘增强**：增加技能树、弱项分析、学习路径可视化。

## 2. 现状基线（已核实）

- 课程内容（S1-S4 课时 + 练习）已完整定义在 `src/server/curriculum/data/index.ts`。
- 4 个阶段项目（p1-static-page, p2-vanilla-board, p3-react-board, p4-fullstack-board）均有测试定义在 `src/server/curriculum/data/tests.ts`。
- 前端页面：课程列表、课程详情、课时详情、练习页、项目页、仪表盘均已实现基础版本。
- AI 适配层：`src/server/ai/coach.ts`（mock + OpenAI），`/api/ai/coach` 路由可用。
- 认证：NextAuth 会话管理，`getSessionUser()` 可用。

## 3. 架构原则（约束）

- 保持模块化单体（ADR-001 延续）。
- 浮窗助手作为 React 组件，注入 `app/layout.tsx`，不修改现有页面结构。
- 浮窗助手复用现有 AI 适配层（`/api/ai/coach`），不需新增后端路由。
- 课程内容完善只修改前端展示层，不改动课程数据定义。
- 仪表盘增强在现有 `/dashboard` 页面基础上增量修改。
- 不引入新框架或依赖；图标使用现有 Lucide 图标库。

## 4. 数据模型（无新增表）

- 浮窗助手使用客户端状态（React state + localStorage 持久化对话历史）。
- 仪表盘增强使用现有 `learning_record` / `project_attempt` / `review_feedback` 数据。

## 5. 里程碑划分

### P3-01: AI 浮窗助手

**核心组件**：
- `src/components/AiAssistant.tsx` — 浮窗按钮 + 聊天面板组件
- `src/components/AiAssistant.css` — 样式（浮窗定位、动画、暗色代码块）
- 注入 `app/layout.tsx`，全站跟随

**功能**：
- 右下角悬浮按钮，点击展开聊天面板
- 面板可拖拽调整位置（localStorage 持久化）
- 输入问题，调用 `/api/ai/coach` 获取回答
- 上下文感知：自动附加当前页面信息（课程/课时/练习/项目）
- Markdown 渲染（代码块、列表、加粗等）
- 对话历史持久化（localStorage）
- 平滑动画（展开/收起/消息出现）

**验收**：
- 浮窗按钮在所有页面右下角可见
- 点击展开/关闭动画流畅
- 输入问题后 AI 返回回答
- 回答中代码块正确渲染（语法高亮或等宽字体）
- 刷新后对话历史保留
- 拖拽位置刷新后保留

### P3-02: 课程内容与项目页面完善

**完善内容**：
- `src/app/page.tsx` — 首页课程列表增强（课程卡片带进度条、阶段标签）
- 项目页面（`/project/[slug]`）—— 完善项目指南展示、验收标准面板
- 练习页面（`/exercise/[id]`）—— 代码题增加 Monaco/CodeMirror 编辑器，节流自动保存
- 课时页面（`/lesson/[slug]`）—— 增加章节导航侧边栏，进度追踪

**验收**：
- 首页课程卡片显示完整进度和阶段标签
- 项目指南按章节正确渲染
- 代码练习有编辑器支持（语法高亮、自动缩进）
- 课时页面有章节 TOC 导航

### P3-03: 学习仪表盘增强

**增强内容**：
- 技能树可视化（按课程阶段展示技能节点）
- 弱项分析（基于 errorHistory + rubric 低分维度）
- 学习路径建议（基于当前进度推荐下一步）
- 学习时间线（近期活动的时间轴视图）

**验收**：
- 仪表盘显示技能树，每个阶段有独立技能节点
- 弱项分析列出具体薄弱环节和建议
- 学习路径显示推荐的下一个学习目标
- 时间线展示最近学习活动

## 6. 技术实现要点

### AI 浮窗助手
```tsx
// AiAssistant 组件架构
function AiAssistant() {
  // 状态：展开/收起、消息列表、输入内容、加载状态
  // 位置：从 localStorage 读取/写入
  // 上下文：从 window.location.pathname 推断当前页面
  // 请求：POST /api/ai/coach { message, context }
  // 渲染：Markdown（代码块、文本、列表）
}
```

### 代码编辑器
使用 CodeMirror 6（轻量、无外部依赖、React 集成良好）：
- `@codemirror/view`、`@codemirror/state`、`@codemirror/lang-javascript`
- 或使用 `react-simple-code-editor`（更轻量）

### 技能树
纯 CSS + React 渲染，不引入 D3/vis 库：
- 树形节点用 flexbox/grid 布局
- 节点颜色按完成状态区分
- 连线用伪元素或 SVG 路径

## 7. 安全审查红线

- 浮窗助手不绕过认证：AI 请求使用当前用户会话
- 上下文信息不包含敏感数据（密码、token）
- 代码编辑器不执行用户代码（仅编辑）
- 对话历史只存 localStorage，不存服务端

## 8. 接受标准（Phase 3 完成定义）

- AI 浮窗助手在所有页面可用，可正常问答
- 课程内容页面完整展示 S1-S4 所有内容
- 仪表盘显示技能树、弱项分析、学习路径
- 代码练习有编辑器支持
- typecheck、vitest、build 全绿
- 所有改动未提交，等待用户审核