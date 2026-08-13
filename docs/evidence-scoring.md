# 证据化 AI 评分设计（P2-05）

> 状态：已实现（2026-08-12）
> 范围：`src/server/scoring/`（aggregator / ai-review-builder / evidence-store / evidence）
> 对应票据：`.scratch/phase2/issues/05-evidence-scoring.md`
> 依赖：P2-02 `src/server/repo/`（RepoSnapshot）、P2-03 `src/server/runner/`（sandbox_run）、P2-04 `src/server/tests/`（test_case / test_run）

## 1. 目标与安全边界

AI 综合 **RepoSnapshot + test_runs（公开+隐藏）+ rubric + acceptanceCriteria + 需求**，输出结构化评分：

- `score`（0-100）
- `rubricResults`（逐维度 level/score/evidence/nextStep）
- `acceptanceResults`（逐条 supported / unsupported / unverifiable）
- `evidenceFacts`（来源类型：`git_diff` / `test_output` / `file_content` / `runtime`）
- `capabilityNote`（如实声明执行范围）

安全红线：

- 评分必须引用已采集证据；AI **不得臆造未执行结果**。
- 隐藏测试结果只作为服务端评分输入，其**名称/明细绝不进入** rubric/acceptance 证据字符串、evidenceFacts 或任何公开 API/UI 响应。
- AI provider 失败时明确报错（502），不落 review_feedback / evidence_fact，绝不伪造评分。
- 沙箱不可用时（infra-unavailable）不评分，保持 P2-01 不变量。

## 2. 数据流

```
仓库提交（submit route）
  → P2-02 ingestRepository → repository_submission.parsed（RepoSnapshot）
  → P2-03 main sandbox_run（install/build/test/verify 证据）
  → P2-04 public + hidden test_run（test_case 关联）
  → P2-05 runEvidenceScoring：
      1. collectFileContentFacts：重新物化仓库，受限读取文本文件（上限 30 个 / 单文件 32KB / 总 256KB，不执行代码）
      2. aggregateEvidenceScore：确定性评分骨架（证据术语命中 + 测试通过率 + 运行时状态）
      3. provider.review(buildEvidenceReviewInput)：mock/openai 基于证据评审
      4. 合并安全兜底（score/rubric/acceptance/capabilityNote 恒有值）
      5. persistEvidenceFacts → evidence_fact（隐藏证据 internal=true）
  → review_feedback（新增 rubric_results/acceptance_results/evidence_facts/capability_note 列）
  → attempt.status = reviewed；learning_record.mastery = score
  → 响应/GET 只返回 publicEvidenceFacts（internal 过滤）
```

## 3. 证据来源与 internal 标记

| sourceType | 内容 | internal |
|---|---|---|
| `git_diff` | diff 摘要 + 逐文件变更（status/+/-） | 否 |
| `test_output` | 公开测试逐项通过/失败/耗时/消息 | 否 |
| `test_output` | 隐藏测试结果（仅评分） | **是** |
| `file_content` | 仓库文本文件内容（README/PRD/源码，截断） | 否 |
| `runtime` | 主沙箱运行状态/退出码/耗时/阶段 | 否 |

- `publicEvidenceFacts` 过滤 `internal` 后进入 API；`listPublicEvidenceFactRecords` 只查询非 internal 行。
- 聚合器的证据字符串只允许引用**公开**测试名称；隐藏测试名称绝不进入面向学习者的文本。
- `capabilityNote` 会声明「隐藏测试已运行（仅用于服务端评分，不对外展示明细）」但**不暴露数量/标识/明细**。

## 4. 评分算法（确定性聚合器）

- rubric：`criterion.evidence` 术语在 文件内容 / 公开测试名称与消息 / diff 路径 中命中，按命中比例映射
  `excellent(1.0) / competent(0.8) / developing(0.5) / missing(0)`，`score = Σ weight × ratio`。
- acceptance：公开测试覆盖且通过 → supported；术语命中文件/diff → supported；外部声明（URL/部署）无测试证据 → unverifiable；否则 unsupported。
- 所有测试通过时 `implementation` 维度最低提升到 developing（有真实运行证据）。
- AI（mock/openai）可以调整 rubric/acceptance 与分数，但 `evidenceFacts` 一律以确定性采集结果为准。

## 5. Provider 扩展

- `ReviewInput` 新增 `evidence?`：`repository` / `testRuns`（含 hidden）/ `runtime` / `fileContents`。
- `ReviewResult` 新增 `evidenceFacts?` 与真实 `capabilityNote`。
- **Mock**：有 evidence 时走证据聚合器；无 evidence（文本提交）保持原文本启发式。
- **OpenAI**：evidence 分支 prompt 包含真实证据，强制 JSON 字段与来源枚举，禁止声称未执行动作；normalize 校验
  rubric 等级、验收状态、sourceType 后与聚合器兜底合并。

## 6. 验证

- 单元：`tests/scoring/evidence.test.ts`、`tests/scoring/aggregator.test.ts`、`tests/scoring/ai-review-builder.test.ts`
- 管线/DB：`tests/scoring/pipeline.test.ts`（evidence_fact 持久化、internal 过滤、AI 失败不落库）
- AI 契约：`tests/ai/mock.test.ts`、`tests/ai/review-contract.test.ts`（capabilityNote 真实声明、隐藏不泄漏）
- API：`tests/api/evidence-scoring.test.ts`（提交/GET 返回 review + evidenceFacts，隐藏标识绝不出现）
- 全量：`npm run typecheck` ✅ / `npm test`（202 passed + 8 skipped）✅ / `npm run build` ✅
