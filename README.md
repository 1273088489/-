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
- **形成性评审**：文本/代码提交不直接在服务器运行用户代码；练习依据公开 rubric 提供自评和 AI 提示，没有隐藏测试。仓库提交的代码只在受限 Docker 沙箱中执行（见 P2-03），并在沙箱内运行公开与隐藏测试（见 P2-04）。
- **Git 仓库接收（P2-02）**：项目页支持提交公开 https 仓库地址或上传 .zip/.tar.gz，系统在隔离临时目录中浅克隆/解包，解析分支、最近提交、diff 统计与变更文件行号，产出 `RepoSnapshot` 并入库。
- **沙箱执行（P2-03）**：仓库解析成功后，按项目 sandbox 配置（runtime/install/build/test/timeout/memory）在受限 Docker 容器中执行：Node 项目 `npm ci → npm run build? → npm test`，静态项目做文件校验；收集逐阶段 stdout/stderr/exitCode/duration，错误分类 timeout/oom/network-blocked/runtime-error/infra-unavailable，结果持久化到 `sandbox_run`。Docker 不可用时明确报错，绝不回退宿主执行。
- **公开+隐藏测试（P2-04）**：每个阶段项目定义公开测试（学习者可见，展示在项目页）与隐藏测试（服务端专用，评估时注入沙箱，绝不在课程数据/API/UI 暴露）。每个测试用例独立沙箱运行并持久化 `test_case`/`test_run`（逐项 pass/fail/duration/message）；隐藏运行只执行固定测试命令、不执行学习者脚本，配合 `--network=none` 与只读根文件系统防止读取与外泄。
- **证据化 AI 评分（P2-05）**：仓库提交后综合 RepoSnapshot、公开+隐藏测试结果、沙箱运行与仓库文件内容，输出结构化评分（score / rubricResults / acceptanceResults / evidenceFacts / capabilityNote），证据持久化到 `evidence_fact`（git_diff / test_output / file_content / runtime）；`capabilityNote` 如实声明执行范围，隐藏测试明细绝不返回给学习者。
- **个性化补课路径（P2-06）**：评审未达通过线或存在失败信号时，规则引擎基于 errorHistory + 测试失败分类 + rubric 低分维度生成有序补课路径（目标 lesson/exercise/project + 完成判定），AI 增强解释；项目页/仪表盘展示，完成全部补课项后更新项目 mastery/status（+20，封顶 100）。详见 `docs/remediation-path.md`。

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
- **RepositorySubmission**（P2-02：仓库快照与解析结果）
- **SandboxRun**（P2-03：沙箱执行结果与逐阶段证据）
- **TestCase / TestRun**（P2-04：公开/隐藏测试定义与逐用例运行结果）
- **EvidenceFact / ReviewFeedback**（P2-05：评分证据与结构化评分明细）
- **RemediationPath**（P2-06：个性化补课路径与完成状态）
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
