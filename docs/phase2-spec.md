# Phase 2 — 仓库接入、沙箱执行、证据化评分与个性化补课

> 状态：DRAFT — 规划中（2026-08-12）
> 本文件由主会话在 TQ-01..TQ-06 合并推送后编写，作为 Phase 2 的规格与分票依据。

## 1. 目标

在现有 Quanzhan 学习平台上新增一条“真实项目交付”链路：

1. 学习者提交一个完整 Git 仓库（远程 URL 或上传压缩包）。
2. 系统安全地接收、分析仓库：识别分支、提交、代码 diff、文件行号。
3. 系统在隔离沙箱中自动安装依赖、构建、运行学习者项目。
4. 系统执行公开测试与隐藏测试，限制 CPU / 内存 / 网络 / 运行时间。
5. 支持多技术栈（Node/TypeScript 优先，Python/其他后续）与不同项目结构。
6. AI 综合代码、测试结果、需求与 rubric，输出证据化评分。
7. 根据错误记录自动生成个性化补课路径。

## 2. 现状基线（已核实）

- 单 Next.js 16.3 单体（App Router），Drizzle ORM + SQLite，better-sqlite3；CI: typecheck + vitest + build（无 Playwright）。
- 提交评审目前是“文本启发式”：`project_attempt.code` 单一文本 ≤100k，AI review + `reviewProjectEvidence` 关键词命中；`capabilityNote` 明确“系统未运行代码、未访问外部资源、未读取 Git 历史/仓库/部署/测试结果”。
- 数据模型无 repository / sandbox / test_case / runner / remediation 表；review_feedback 不持久化 rubric/acceptance 细节（GET 时重算）。
- 无任何 child_process / vm / sandbox / git 解析代码。
- 教学契约（docs/teaching-quality-contract.md）把“真实 Git 仓库接入、用户代码执行、隐藏测试、自动补课”明文列为非目标；README/UI/测试断言“没有隐藏测试”。
- 依赖与 Next.js 16 的 AGENTS.md 规则：node_modules 可能为 junction；应读 node_modules/next/dist/docs 再写代码。

## 3. 架构原则（约束）

- 保持模块化单体：不拆微服务（ADR-001）。沙箱执行作为服务端模块/独立进程，不引入新框架。
- 安全优先：不可信代码只在隔离沙箱运行；主进程永不直接执行学习者代码。
- 证据分级：测试输出、Git 元数据、文件内容均作为“证据”，评分必须引用这些证据，而不是 LLM 臆测。
- 渐进式：先 Node/TypeScript 栈 + Git 远程/上传包，后续扩展 Python。
- 文档与契约同步更新：明确“形成性评审”与“可执行评审”的区别，文档不再宣称“没有隐藏测试”。

## 4. 数据模型（新增）

- `repository_submission`：用户提交的仓库（url / archive_path / parsed state / status / error）
- `sandbox_run`：一次沙箱运行（attemptId、阶段、状态、start/end、退出码、资源用量）
- `test_case` / `test_run`：公开/隐藏测试定义、运行结果（stdout/stderr/duration/pass 等）
- `evidence_fact`：评分证据（来源类型：git_diff / test_output / file_content / runtime）
- `remediation_path`：个性化补课路径（错误类型 → 学习内容映射、完成状态）

设计细节：所有新表挂在现有 `project_attempt` / `learning_record` 之下，沿用 drizzle sqlite 迁移 + 测试 DDL 模式。

## 5. 沙箱设计（核心难点，安全第一）

选择：**Docker 容器沙箱（每提交一次性容器）+ 资源限制**，与主 Next 进程隔离。

- 镜像：`node:24-bookworm-slim`（Node）为基础；未来 `python:3.12-slim`。
- 限制：`--memory=512m --cpus=1 --network=none --pids-limit=64 --read-only` + 超时（脚本 kill）。
- 执行流：提交 → 解包/克隆（主进程外，临时目录，限大小/深度）→ 复制进沙箱 → `npm ci`/`npm test`/`build` → 收集 stdout/stderr/exit code/duration → 清理。
- 不允许：网络（隐藏测试本地跑）、持久卷、特权容器、宿主挂载。
- 降级：Docker 不可用时禁止执行，仅返回“沙箱不可用”，绝不回退到宿主机执行。
- 每个项目定义 `sandbox` 配置（在 curriculum 数据中）：`runtime`, `install`, `test`, `build`, `timeout`, `memory`, `env`。
- 超时与限额：默认 60s，内存 512MB，无网络；错误分类（timeout / oom / network-blocked / compile-error / test-failure）。

## 6. Git 分析

- 支持 `git clone --depth 1 <url>`（限协议：仅 https/http，禁止本地路径/ssh）与上传 `.zip`/`.tar.gz` 解包。
- 解析：branches（--no-color branch -a）、commits（log --oneline -n 20）、diff（git diff 统计 + 逐文件）、文件行号（blame/line ranges for changed hunks）。
- 大小限制：仓库 ≤ 50MB（解压后），文件数 ≤ 2000，单文件 ≤ 1MB。
- 存储：克隆目录在临时区域，评估后清理；只保留结构化元数据入库。

## 7. 测试执行与证据化评分

- 公开测试：项目定义的测试，学习者可见；隐藏测试：由系统在评估时注入（不在课程数据中暴露）。
- 执行结果 → 结构化 `test_run`：每用例 pass/fail/duration/断言信息。
- 评分管线：
  1. 运行公开测试 → 基础分数 + 失败明细。
  2. 注入隐藏测试 → 隐藏分数。
  3. Git 分析（提交粒度、diff、行号）→ 证据（改动是否覆盖需求）。
  4. 静态检查（构建、lint 可选）。
  5. AI 综合：代码 + 测试结果 + 需求 + rubric → 结构化评分 JSON（score, rubricResults, acceptanceResults, evidenceFacts, capabilityNote 更新为“基于实际测试与仓库证据”）。
  6. 所有证据存 `evidence_fact`，评分可复核。
- 安全边界保留：AI 不得声称执行了未执行的动作；每个 capabilityNote 报告真实执行范围。

## 8. 个性化补课路径

- 输入：learning_record.errorHistory + 测试失败分类 + rubric 低分维度。
- 输出：`remediation_path`（目标 lesson/exercise/project、顺序、预期完成判定）。
- 规则引擎优先（映射表），AI 增强生成解释。
- 与现有进度/仪表盘打通：完成补课项后更新 mastery/status。

## 9. 多栈支持

- 抽象 `RuntimeAdapter`：`detect(project)`, `install`, `build`, `test`, `run`。
- v1: `node`（package.json 存在）与 `static`（纯 HTML/JS，无构建）。
- v2: python。
- 配置放在课程数据 `runtime` 字段或项目的 `quanzhan.sandbox.json`（学习者仓库内可选）。

## 10. 安全审查红线（不变量）

- 主进程不直接执行学习者代码（必须经沙箱进程）。
- 沙箱无网络、无宿主 FS、无特权；资源限额强约束。
- 上传/克隆大小、深度、文件树严格校验。
- 所有评分必须引用已采集证据；不臆造测试结果。
- 失败路径：沙箱不可用 → 明确报错，不回退、不伪造成功。

## 11. 里程碑划分（ticket DAG）

见 `.scratch/phase2/issues/`。每个 issue 声明 blocking edges；实现按拓扑序。

## 12. 验收（Phase 2 完成定义）

- 学习者可在项目页提交 Git URL 或上传 zip。
- 系统可安全克隆/解包、安装依赖、构建、跑公开+隐藏测试。
- 沙箱资源受限、无网络、可证明未接触宿主。
- 评分结果含测试证据、rubric 明细、capabilityNote 真实声明。
- 仪表盘显示错误驱动的个性化补课路径。
- typecheck、vitest、build、e2e 绿色；新增安全测试覆盖绕过尝试。
