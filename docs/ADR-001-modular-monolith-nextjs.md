# ADR-001: 单 Next.js 应用（模块化单体）
- 状态：Accepted
- 背景：个人 MVP，小团队、边界可逐步演化；需求强调“从零跑通完整项目”，不宜过早引入运维负担。
- 决策：采用单一 Next.js 应用；后端逻辑置于 `src/server`（db、auth、ai、review、curriculum），通过 Next Route Handlers 暴露 API。
- 后果：
  - 好处：开发/部署/联调简单，一次 `npm run dev` 起全栈。
  - 代价：未来若需独立伸缩后端或单独部署 AI 服务，需再拆分；MVP 阶段可接受。
