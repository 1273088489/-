# Quanzhan — AI 全栈项目教练（MVP）

> “一字一字学懂的完整项目推进器”：从一个空的“工单管理系统”逐步成长到 React + API + PostgreSQL + 测试 + CI/CD 的完整全栈项目，AI 在学习、做题、代码审查和选型决策处提供分级反馈。

## 项目背景（2026-08-04 调研结论）
- 市面无单一产品同时满足：中文、零基础全栈、做题、完整项目、AI 代码审查、动态调整路线、系统讲技术选型。
- 因此自建个人使用的 **“AI 项目教练”** MVP，而不是大型在线教育平台。

## 技术栈（尽量采用 npm 最新稳定版）
- **框架**：Next.js 15+（App Router）+ React 19 + TypeScript
- **样式**：Tailwind CSS 4
- **数据库**：本地优先 **SQLite（better-sqlite3）**，通过 Drizzle ORM 访问；保留 PostgreSQL 适配（pg + drizzle），提供 docker-compose 作为可选。
- **AI**：AI 适配层，优先 OpenAI 兼容接口；无 key 时退化为本地规则 mock（可运行、可演示）。
- **测试**：Vitest（单元）+ Playwright（E2E）。
- **代码运行**：MVP 阶段不直接在服务器跑用户代码；练习以“对比答案/自评/AI 提示”为主，隐藏测试预置在课程内容中做自评。

## 目标目录结构
```
Quanzhan/
├── docs/                 # ADR、数据模型、API 契约、产品说明
├── curriculum/           # 课程内容（YAML/JSON/MD 版本化）
├── scripts/              # 初始化、种子、运行脚本
├── src/
│   └── app/              # Next.js App Router（页面 + route handlers）
│   └── server/           # 服务端逻辑：db、auth、ai、curriculum、review
│   └── components/       # React 组件
├── tests/                # 单元测试与 E2E
└── package.json
```

## 核心数据实体
- **User / Session**
- **Curriculum / Lesson / Exercise / StageProject**
- **LearningRecord**（掌握度、状态、错题）
- **ProjectAttempt / Submission**
- **ReviewFeedback**（AI 分级反馈、checklist、分数）
- **ChoiceLab**（选型实验、答案、评价）

## 已确认 ADR
见 `docs/ADR-*.md`。关键决策：
1. ADR-001：单 Next.js 应用（模块化单体），不拆微服务。
2. ADR-002：Drizzle ORM + SQLite 优先，PostgreSQL 可切换。
3. ADR-003：AI 适配层（provider 接口 + mock 回退）。
4. ADR-004：Auth 自研轻量 session（cookie + DB），MVP 不引重型框架。

## 运行方式
```bash
npm install
npm run setup     # 初始化 SQLite schema 并导入课程种子
npm run dev       # 开发模式
npm run test      # 单元测试
```

默认访问地址：`http://localhost:3000`。首次进入先注册账号；未配置 AI Key 时会自动使用本地 Mock AI，代码审查、分级提示和选型实验仍可完整演示。

截至 2026-08-10，本项目安装并验证的主要版本为 Next.js 16.3.0、React 19.2.8、TypeScript 7.0.2、Drizzle ORM 0.45.2、better-sqlite3 13.0.3、Vitest 4.1.10 与 Playwright 1.62.1。
