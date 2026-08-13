# 个性化补课路径（P2-06）

> 状态：已完成（2026-08-12）
> 模块：`src/server/remediation/`、`src/app/api/remediation/`、仪表盘/项目页
> 依赖：P2-05 证据化评分（review_feedback.rubricResults / test_run / learning_record.errorHistory）

## 1. 目标

根据错误记录自动生成个性化补课路径：

- 输入：`learning_record.errorHistory` + 测试失败分类 + rubric 低分维度
- 输出：`remediation_path`（目标 lesson/exercise/project、顺序、完成判定）
- 规则引擎映射（错误类型 → 学习内容）+ AI 增强解释
- 仪表盘/项目页展示，完成补课更新 mastery/status

## 2. 生成时机（懒生成）

补课路径在读取时按“最近一次评审”懒生成（`GET /api/remediation?projectSlug=<slug>`），无需改提交路由：

1. 取该用户在该项目下最近一次 `project_attempt`；
2. 已有该 attempt 的路径 → 直接返回（幂等，不重复生成）；
3. 无提交 / 未评分 → 不生成；
4. 读取 review_feedback（score + rubricResults）、test_run（含隐藏，仅服务端分类）、learning_record.errorHistory；
5. 规则引擎产出信号；得分 < 80 或存在任何失败信号 → 生成路径；得分达标且无失败信号 → 不生成。

## 3. 规则引擎（`mapper.ts`）

三路信号 → `RemediationSignal[]`（每个信号带规则 id、学习者可见的触发摘要、目标内容 slug）：

| 信号来源 | 分类方式 | 说明 |
|---|---|---|
| errorHistory | 关键字规则表 `ERROR_HISTORY_RULES`（git-env / js-dom / react / backend / auth / security / testing / deploy） | 每条只取最具体首个命中；security 优先于 auth |
| 测试失败 | 按项目阶段映射 `PROJECT_TEST_TARGETS` + `PROJECT_STAGE_LESSON` | public 失败可引用测试名；hidden 失败只泛化到阶段课时与项目重交，**绝不暴露名称/明细** |
| rubric 低分 | `RUBRIC_DIM_TARGETS`（implementation / verification / decision-record） | 只取 level=missing/developing 的维度 |

## 4. 路径构建（`builder.ts`）

- 解析 slug → 已入库内容（lesson/exercise/project）；
- 去重（同一内容保留首个理由）；顺序：**课时 → 练习 → 项目重交**（组内保持信号产生顺序）；
- 得分 < 80 且尚无项目重交项时自动补一项（reason 含分数）；
- 单路径上限 `MAX_REMEDIATION_ITEMS = 6`，项目重交恒保留；
- 完成判定（`evaluateItemCompleted`，读取时实时计算）：
  - lesson / exercise：`learning_record.status === completed`
  - project：`learning_record.mastery >= 80`

## 5. AI 增强解释（`enhance.ts`）

规则摘要恒生成；随后 best-effort 调用现有 AI 适配层 `coach`（提问“补课学习顺序建议”）追加 `**AI 学习建议**`。AI 只增强解释、不改变补课项；任何失败都回退到规则摘要，绝不抛错。

## 6. 完成补课（`completeRemediationPath`）

`POST /api/remediation/[id]/complete`：

- 全部补课项按完成判定通过 → 路径 `status=completed`、写 `completedAt`；
- 更新项目 learning_record：`mastery = min(100, mastery + 20)`，`mastery >= 80` 时 `status=completed`，否则 `in_progress`；
- 有未完成项 → 409 `{ remaining: string[] }`；已完成路径再次调用幂等返回。

## 7. API

- `GET /api/remediation` —— 当前用户全部路径（实时完成状态）
- `GET /api/remediation?projectSlug=<slug>` —— 懒生成并返回该项目路径（幂等）
- `GET /api/remediation/[id]` —— 单条路径
- `POST /api/remediation/[id]/complete` —— 完成补课（更新 mastery/status）

## 8. 安全与隐私

- 隐藏测试只参与服务端分类，其 key/name/输出绝不进入补课原因、摘要或 API 响应；
- 所有面向学习者的原因文本均来自规则表或公开测试名；
- AI 增强为 best-effort，失败不阻断生成。

## 9. 测试

`tests/remediation/`（27 项）：

- `mapper.test.ts` —— 错误类型 → 学习内容；hidden 不泄漏；rubric 低分分类；
- `builder.test.ts` —— 排序/去重/限长/兜底/完成判定；
- `enhance.test.ts` —— AI 增强与回退；
- `api.test.ts` —— 懒生成、幂等、列表、409、完成更新 mastery/status。
