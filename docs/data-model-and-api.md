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

### ReviewFeedback
- id: text pk
- attemptId: text fk
- provider: text
- score: int
- summary: text
- checklist: text (json)
- suggestions: text (json array)
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
- GET  `/api/project/[slug]` -> project detail + tasks
- POST `/api/project/[slug]/submit` {code} -> AI review feedback
- POST `/api/ai/coach` {contextId, question, mode} -> coach answer (levels)
- POST `/api/ai/review` {attemptId} -> run reviewer
- GET  `/api/choicelab` -> scenarios
- POST `/api/choicelab/[id]/submit` {selectedOption, rationale} -> ai evaluation
- GET  `/api/progress` -> learning progress summary

## AI 分级反馈约定
- Coach 分 4 级提示：`hint1..hint3`（苏格拉底式），`solution`（仅用户明确请求或已尝试后）。
- Reviewer 按 checklist 返回：🔴 blocker / 🟡 suggestion / 💭 nit，附带行号或证据。


