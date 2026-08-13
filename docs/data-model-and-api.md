# 数据模型与 API 契约（MVP）

## 数据实体（Drizzle schema, `src/server/db/schema.ts`）
所有表使用 camelCase 字段名（Drizzle 默认），主键 `id` 用自增 int 或 text uuid。为简单统一用 text uuid。

### User
- id: text pk
- email: text unique
- name: text
- passwordHash: text
- createdAt, updatedAt

### Session
- id: text pk
- userId: text fk
- token: text unique
- expiresAt: datetime
- createdAt

### Course
- id: text pk
- slug: text unique
- title: text
- description: text
- orderIndex: int

### Lesson
- id: text pk
- courseId: text fk
- slug: text unique
- title: text
- orderIndex: int
- contentMarkdown: text
- requiresPass: boolean

### Exercise
- id: text pk
- lessonId: text fk
- slug: text
- prompt: text
- hints: text (json array)
- solution: text
- rubric: text (json)
- answerType: text (choices|code|text)
- choices: text (json array for choices)

### StageProject
- id: text pk
- courseId: text fk
- slug: text unique
- title: text
- description: text
- orderIndex: int
- tasks: text (json array)
- acceptanceCriteria: text (json array)
- guideMarkdown: text
- deliverables: text (json string array)
- rubric: text (json `ProjectRubricCriterion[]`)
- reflectionQuestions: text (json string array)
- sandboxConfig: text (json `ProjectSandboxConfig`，P2-03 新增)  # runtime/install/build/test/timeout/memory/env

`ProjectRubricCriterion` 包含项目内唯一的 `id`、评分维度 `criterion`、正整数权重 `weight`、证据列表 `evidence`，以及固定的 `excellent`、`competent`、`developing`、`missing` 四级描述。单个项目的 rubric 权重总和为 100。

### LearningRecord
- id: text pk
- userId: text fk
- contentId: text        # lesson/exercise/project id
- contentType: text      # lesson|exercise|project
- status: text           # not_started|in_progress|completed|needs_review
- mastery: int           # 0-100
- errorHistory: text (json array)
- updatedAt

### ProjectAttempt
- id: text pk
- userId, projectId
- code: text             # 用户提交的代码/答案
- status: text
- submittedAt

### RepositorySubmission（P2-02 新增）
- id: text pk
- attemptId: text fk -> project_attempt（级联删除）
- sourceType: text   # url | archive
- sourceUrl: text    # 仅 https，仓库地址
- archiveName: text  # 上传文件名
- archiveKind: text  # zip | tar.gz
- status: text       # parsed | failed
- snapshot: text     # JSON `RepoSnapshot`（分支/提交/diff 统计/行号/文件树）
- error: text        # 失败原因（学习者可读）
- createdAt, updatedAt

`RepoSnapshot` 由 `src/server/repo/types.ts` 定义，包含 `source`、`head`、
`branches`、`commits`、`diff`（baseRef/filesChanged/insertions/deletions/逐文件
`lineRanges` 行区间）、`tree`（fileCount/totalBytes/files）与 `analyzedAt`。

### SandboxRun（P2-03 新增）
- id: text pk
- attemptId: text fk -> project_attempt（级联删除）
- repositorySubmissionId: text fk -> repository_submission（级联删除）
- runtime: text   # node | static
- status: text    # success | failed
- errorCode: text # "" | timeout | oom | network-blocked | runtime-error | infra-unavailable
- exitCode: int（可空）
- stdout: text
- stderr: text
- phases: text    # JSON `SandboxPhaseResult[]`（逐阶段 exitCode/stdout/stderr/durationMs/skipped）
- startedAt / finishedAt: text
- durationMs: int
- timedOut: bool
- oomKilled: bool
- message: text   # 失败原因（学习者可读）
- createdAt, updatedAt

`ProjectSandboxConfig` 定义在 `src/server/runner/types.ts`：`runtime`（缺省按仓库结构自动检测）、
`image`、`install`、`build`、`test`（argv 或 null 表示跳过）、`timeoutMs`、`memoryMb`、`env`。
执行流：仓库解析成功后，把快照重新物化到隔离临时目录 → docker cp 进受限容器
（`--network=none --memory=512m --cpus=1 --pids-limit=64 --read-only`）→
按阶段（install → build → test / static verify）顺序执行并采集证据 → 清理。

### TestCase / TestRun（P2-04 新增）
`test_case`（测试定义，`stage_project` 级）：
- id: text pk
- projectId: text fk -> stage_project（级联删除）
- key: text  # 项目内稳定标识，(projectId, key) 唯一
- kind: text # public | hidden（hidden 仅服务端使用）
- name: text
- framework: text # node:test | vitest | jest | static-check
- files: text     # JSON `Record<path, content>`，注入沙箱测试目录
- command: text   # JSON argv；空数组按 framework 生成默认命令
- orderIndex: int
- createdAt, updatedAt

`test_run`（一次运行结果，`sandbox_run` 级）：
- id: text pk
- sandboxRunId: text fk -> sandbox_run（级联删除）
- testCaseId: text fk -> test_case（级联删除）
- attemptId: text fk -> project_attempt（级联删除）
- status: text   # passed | failed | error | skipped
- passed: bool
- durationMs: int
- message: text  # 归一化断言明细（失败时含失败断言）
- stdout / stderr: text（证据，仅服务端/公开测试展示）
- createdAt

`sandbox_run` 增加 `kind` 列：`main`（P2-03 主执行）/ `public`（公开测试用例）/ `hidden`（隐藏测试用例）。
公开 API 只返回 `kind=main` 的 `latestSandboxRun` 与 `kind=public` 的 `test_run`；隐藏测试结果仅落库供评分使用。

### EvidenceFact（P2-05 新增）
- id: text pk
- attemptId: text fk -> project_attempt（级联删除）
- sourceType: text # git_diff | test_output | file_content | runtime
- label: text      # 人类可读标题
- detail: text     # 证据详情（内容摘要/断言/运行信息，截断）
- ref: text        # 结构化引用，如 file:README.md / test:<key> / run:main
- internal: bool   # true = 仅服务端证据（隐藏测试），公开 API 绝不返回
- createdAt

评分证据由 `src/server/scoring/` 采集：仓库 diff、公开+隐藏测试运行、主沙箱运行与仓库文本文件内容；
`capabilityNote` 只声明真实执行范围，不验证外部 URL/部署。

### RemediationPath（P2-06 新增）
- id: text pk
- userId: text fk -> user（级联删除）
- attemptId: text fk -> project_attempt（级联删除；触发补课的评审）
- projectId: text fk -> stage_project（级联删除）
- status: text   # active | completed
- source: text   # JSON `RemediationSource`（score + errorHistory/test-failure/rubric-low 信号摘要）
- items: text    # JSON `StoredRemediationItem[]`（有序目标：lesson/exercise/project、理由、完成判定）
- explanation: text  # 规则引擎摘要 + AI 增强学习建议
- startedAt / completedAt: text
- createdAt, updatedAt

补课路径由 `src/server/remediation/` 生成：输入 learning_record.errorHistory + 测试失败分类（test_run/test_case，隐藏测试只泛化分类，不暴露名称/明细）+ rubric 低分维度（review_feedback.rubricResults 中 missing/developing）。规则引擎优先（错误类型 → 学习内容映射表），AI 仅增强解释（best-effort，失败回退规则摘要）。完成判定：lesson/exercise 看 learning_record.status=completed，project 看 learning_record.mastery >= 80；全部完成后 POST complete 将项目 mastery += 20（封顶 100），>=80 时 status=completed。

### ReviewFeedback
- id: text pk
- attemptId: text fk
- provider: text
- score: int
- summary: text
- checklist: text (json)
- suggestions: text (json array)
- rubricResults: text (json `RubricReviewItem[]`，P2-05 新增)
- acceptanceResults: text (json `AcceptanceReviewItem[]`，P2-05 新增)
- evidenceFacts: text (json `EvidenceFact[]`，P2-05 新增；含 internal 隐藏证据，仅服务端)
- capabilityNote: text（真实执行范围声明，P2-05 新增）
- createdAt

### ChoiceLab
- id: text pk
- userId
- scenarioId: text
- selectedOption: text
- rationale: text
- aiFeedback: text
- score: int
- createdAt

## 主要 REST API（Next Route Handlers）
所有返回 `{ ok: true, data }` 或 `{ ok: false, error }`。

- POST `/api/auth/register` {email,name,password} -> session
- POST `/api/auth/login` {email,password} -> session
- POST `/api/auth/logout`
- GET  `/api/auth/me` -> user
- GET  `/api/course` -> courses with progress
- GET  `/api/course/[slug]` -> course detail (lessons + projects)
- GET  `/api/lesson/[slug]` -> lesson content
- POST `/api/lesson/[slug]/complete` {mastery}
- GET  `/api/exercise/[id]` -> exercise
- POST `/api/exercise/[id]/submit` {answer} -> judgement/feedback
- GET  `/api/project/[slug]` -> project detail + tasks + acceptanceCriteria + guideMarkdown + deliverables + rubric + reflectionQuestions
- POST `/api/project/[slug]/submit`
  - `{code}` -> AI review feedback（原有行为不变）
  - `{repoUrl}`（仅 https）-> `{ attempt, repository: RepoSnapshot, sandboxRun: SandboxRunRecord, publicTests, testRuns, review }`；仓库接收/解析后在受限沙箱执行（install/build/test），并运行公开+隐藏测试（`test_case`/`test_run` 持久化；`testRuns` 只含公开结果），随后执行证据化 AI 评分（P2-05：`review` 含 score/rubricResults/acceptanceResults/evidenceFacts/capabilityNote，`evidenceFacts` 只含公开证据，隐藏测试结果绝不返回），沙箱不可用返回 502 `{ code: "sandbox-infra-unavailable", sandboxRun }`
  - multipart `archive`（.zip / .tar.gz）-> 同上
  - 解析失败返回 `{ ok:false, error, code }`（invalid-url / invalid-archive / archive-too-large / too-many-files / file-too-large / unsafe-path / clone-failed 等）
- GET `/api/project/[slug]` -> 增加 `latestRepository`（最近一次 repository_submission，含 snapshot/status/error）、`latestSandboxRun`（最近一次 `kind=main` 的 sandbox_run，含 status/errorCode/phases）、`publicTests`（公开测试定义）、`publicTestRuns`（最近一次公开测试运行结果）；`feedback` 返回持久化的证据化评分（P2-05：rubricResults/acceptanceResults/evidenceFacts/capabilityNote，旧文本提交回退文本启发式）
- POST `/api/ai/coach` {contextId, question, mode} -> coach answer (levels)
- POST `/api/ai/review` {attemptId} -> run reviewer
- GET  `/api/choicelab` -> scenarios
- POST `/api/choicelab/[id]/submit` {selectedOption, rationale} -> ai evaluation
- GET  `/api/progress` -> learning progress summary
- GET  `/api/remediation` -> 当前用户补课路径列表（实时完成状态）；`?projectSlug=<slug>` 时按最近一次失败评审懒生成并返回该项目的路径（幂等；无提交/未评分/得分达标且无失败信号时返回 `[]`）
- GET  `/api/remediation/[id]` -> 单条补课路径（实时完成状态）
- POST `/api/remediation/[id]/complete` -> 全部补课项完成后标记路径 completed，并更新项目 learning_record（mastery += 20，>=80 时 status=completed）；有未完成项返回 409 `{ remaining: string[] }`

## AI 分级反馈约定
- Coach 分 4 级提示：`hint1..hint3`（苏格拉底式），`solution`（仅用户明确请求或已尝试后）。
- Reviewer 按 checklist 返回：🔴 blocker / 🟡 suggestion / 💭 nit，附带行号或证据。


