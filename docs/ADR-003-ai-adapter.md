# ADR-003: AI 适配层（provider 接口 + mock 回退）
- 状态：Accepted
- 背景：AI 能力依赖供应商 key，但 MVP 需要可运行、可演示、可测试。
- 决策：定义 `AiProvider` 接口；实现 `OpenAiProvider`（支持 OpenAI Chat Completions 和 Responses 兼容协议）与 `MockAiProvider`（规则化本地回复）。通过 `AI_PROVIDER` + `OPENAI_API_KEY` 环境变量选择，使用 `OPENAI_API_MODE=responses` 切换 Responses 协议。
- 后果：无 key 也全功能可跑；接真实模型只需实现 provider。
