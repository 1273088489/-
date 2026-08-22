# Docker ttyd 学习终端实施计划

## Goal

将展示型 LessonTerminal 替换为真实 Docker + ttyd 终端。一个登录用户在一个课程中复用一个受限容器和 named volume；课时页与问答练习页连接同一环境。桌面端终端固定右侧，宽度 380px、高度 315px；移动端继续堆叠。所有改动保持未提交。

## Architecture

- 既有 src/server/sandbox 仍只处理一次性、不可信命令，绝不改变其“执行后删除容器”的语义。
- 新增 src/server/terminal 作为持久终端的唯一 owner，复用现有 createDockerExec，不直接拼接 shell 字符串。
- 运行时归属键是 userId + courseSlug；同一键复用一个容器和工作区 volume。
- 每个容器连接 Docker internal 网络，不发布端口；custom server 以容器内部 IP 反向代理 ttyd 的 HTTP 与 WebSocket 流量。
- 运行时从 TERMINAL_IMAGE 读取完整且固定的 image digest；仅 docker image inspect，绝不 docker pull。
- 容器在应用正常 SIGINT/SIGTERM 退出时清理；volume 保留。运行时启动和周期 reaper 根据持久记录回收超过 TTL 的容器和 volume；用户显式重置同样删除二者。

## Tech Stack

Next.js 16 custom server、Node.js http/net/crypto、既有 Docker CLI wrapper、SQLite/Drizzle、Docker named volume、Docker internal network、ttyd 预拉取镜像。不得添加 npm 依赖。

## Baseline / Authority Refs

- CONTEXT.md：一个持续演进的工单系统贯穿课程。
- docs/ADR-001-modular-monolith-nextjs.md：当前 Next 模块化单体边界。
- docs/ADR-004-session-auth.md 与 src/server/auth/session.ts：cookie session 是登录用户事实来源。
- docs/sandbox-security.md、docs/sandbox-execution.md、src/server/sandbox/docker.ts、src/server/sandbox/runner.ts：既有 Docker 安全基线与 CLI 封装。
- Next 16 custom-server.md：Route Handler 不能作为 ttyd WebSocket upgrade owner 时允许 custom server。

BaselineUsageDraft:
- Required baseline refs: 上述课程、认证、sandbox 与 Next custom-server 文档。
- Cited in plan refs: 全部。
- Missing refs: ttyd 具体镜像 digest 由部署时预拉取命令提供，不硬编码未经验证的 digest。
- Decision: continue。

## Requirement Ready Check

- Goals and scope: 可输入 ttyd；同用户同课程共享环境；课时与问答练习两处接入；右栏固定；安全/回收；不自动拉镜像。
- Acceptance: 见 Verification。
- Open blocker questions: 无。工作区跨服务重启保留、镜像预拉取且运行时不拉取已由用户确认。
- Decision: ready。

## Compatibility Boundary

- 保留既有 runInSandbox 的一次性容器语义和 API。
- 课时与练习 API 继续以现有 cookie session 认证；不得给匿名请求创建或代理终端。
- 不暴露 Docker IP、Docker published port、Docker Socket 或 ttyd 密码给浏览器。
- 不改变已有课程数据和练习提交行为。

## Change Necessity

- User-visible need: mock 终端无法输入，不能保存连续课程项目状态。
- No-change option: 仅扩大 mock 组件或使用浏览器本地 shell 都不能执行 Docker 隔离命令或保持服务器端项目状态。
- Minimum change boundary: 新持久 terminal owner、custom proxy、共享前端组件和持久归属记录。
- Decision: code-change。

## Existence Check

- Proposed new surface: src/server/terminal。
- Existing owner / reuse candidate: src/server/sandbox 的 Docker CLI wrapper。
- Why insufficient: sandbox 强制一次性容器和匿名 volume；持久用户项目会破坏它的单一职责。
- Creation proof: 持久容器、volume retention、ttyd HTTP/WebSocket proxy 属于不同运行时生命周期。
- Decision: add-with-proof；复用 createDockerExec，不复制 Docker 子进程逻辑。

## Architecture Integrity Lens

- Canonical owner: src/server/terminal 管理终端容器、volume、ownership 和 TTL；custom server 仅鉴权和转发。
- No caller fallback: 课时与练习前端不创建容器、不计算 Docker 名称、不处理 Docker 错误。
- Retirement: 当前 mock 输出和复制命令 UI 随真实 ttyd 接入移除；一次性 sandbox 保留。
- Verdict: 新 owner 必需且责任不重叠。

## TDD Route

- Mode: off。
- Decision: light。
- Strict authority: not applicable。
- Test posture: post-change regression + Docker opt-in smoke。
- Reason: 当前项目未要求严格 RED/GREEN；Docker 实机测试需显式环境条件。
- Verification: 每个 owner 使用注入的 Docker CLI 断言参数；真实 Docker smoke 在预拉取镜像后执行。

## File Map

| Owner | Files | Boundary |
| --- | --- | --- |
| runtime-owner | src/server/terminal/runtime.ts, src/server/terminal/types.ts, src/server/db/schema.ts, migration files, tests/terminal/runtime.test.ts | 容器/volume/network、持久 ownership、TTL、Docker 参数 |
| proxy-owner | server.ts, src/server/terminal/gateway.ts, package.json, tests/terminal/gateway.test.ts | custom server、cookie auth、HTTP/WS proxy、SIGINT/SIGTERM cleanup |
| frontend-owner | src/components/LessonTerminal.tsx, src/app/lesson/[slug]/page.tsx, src/app/exercise/[id]/page.tsx, src/components/index.ts, src/types/index.ts | 共享 iframe terminal UI 与两个调用点布局 |
| quality-owner | tests/terminal/*.test.ts only | 共享回归、Docker opt-in smoke、最终审查；不得修改实现文件 |
| captain | .env.example, README.md, final integration | 固定镜像配置、预拉取说明、跨 owner 接缝处理 |

## Task Batches

### Batch 1: persistent terminal runtime

Owner: runtime-owner, model yyds/gpt-5.6-terra-high.

1. Add a terminal project persistence record keyed by unique userId + courseSlug; record volume name, container name, and trusted server-maintained lastActiveAt.
2. Add terminal Docker argument builders that require TERMINAL_IMAGE to contain @sha256:, use a named volume at /workspace, use an internal network, set CPU/memory/PIDs/read-only/tmpfs/non-root/no-new-privileges/cap-drop flags, publish no port, and add instance/user/course/expiry labels.
3. Create or reuse the user-course container only after local image inspection succeeds; never pull.
4. Add trusted TTL cleanup for stale records: remove matching terminal container then its named volume and record. Add explicit reset.
5. Add injectable Docker tests proving fixed args, image-missing failure, same-key reuse, cross-user separation, expiration cleanup, and no host path mounts.

Acceptance: runtime has no host execution fallback and no Docker network/port exposure.

### Batch 2: authenticated ttyd proxy and lifecycle

Owner: proxy-owner, model yyds/gpt-5.6-terra-high. Depends on Batch 1 public runtime contract.

1. Add a custom Node server that delegates all non-terminal paths to Next.
2. For /terminal/:courseSlug HTTP and WebSocket traffic, obtain the existing session cookie, reject anonymous requests, resolve or create the runtime project, and proxy only to that container's internal ttyd address.
3. Validate course slug as a known course before creating a terminal. The client cannot supply a user id, Docker address, image, container name, command, or port.
4. Install SIGINT/SIGTERM handlers that stop this application instance's terminal containers before closing the server; preserve volumes.
5. Ensure HMR/dev behavior does not register duplicate signal handlers and proxy failures become terminal-specific errors.
6. Add gateway tests for unauthorized access, malformed path rejection, no proxy target from client input, and shutdown cleanup delegation.

Acceptance: browser sees only same-origin terminal URLs; Docker container ports remain unpublished.

### Batch 3: shared frontend terminal

Owner: frontend-owner, model yyds/gpt-5.6-terra-high. Depends on Batch 2 terminal URL contract.

1. Replace the mock command/output surface with a reusable terminal frame that points to same-origin /terminal/:courseSlug/ and has loading, unavailable, and retry states.
2. Use existing lesson/ExerciseDetail course slug fields; do not add a terminal creation API from the browser.
3. Pass the course scope from the lesson page and from the exercise page. Both must resolve to the same URL for the same course.
4. Use a fixed desktop aside width of 380px and terminal frame content height of 315px. Preserve mobile stacking below the lesson/exercise content.
5. Remove mock start/stop/copy behaviors that falsely imply command execution.

Acceptance: one component handles both callers; text cannot overflow its fixed terminal frame.

### Batch 4: configuration, integration, verification, review

Owner: captain + quality-owner, model yyds/gpt-5.6-terra-high. Depends on Batches 1-3.

1. Document TERMINAL_IMAGE as a pinned-image@sha256:digest value and the explicit deployment pre-pull command in .env.example and README. Runtime must not pull.
2. Add only cross-owner tests needed to prove course scope reuse and display sizing. Do not duplicate every course/lesson test.
3. With a pre-pulled approved image, run one opt-in Docker smoke: verify no published port, internal network, non-root process, read-only root, no host mounts, right resource flags, keyboard input and terminal output through the same-origin proxy, and graceful app shutdown container cleanup while volume persists.
4. Run one lesson integration smoke and one question exercise integration smoke.
5. Inspect the final diff for unauthorized routes, package additions, raw Docker ports, host mounts, Docker socket references, user-controlled Docker args, and changes outside the file map.

## Verification

- Focused: npm test -- --run tests/terminal/runtime.test.ts tests/terminal/gateway.test.ts.
- Existing regressions: npm run typecheck; npm test -- --run; npm run build; git diff --check.
- Docker smoke, only after image is already locally available: TERMINAL_DOCKER_SMOKE=1 npm test -- --run tests/terminal/smoke.test.ts.
- Browser smoke: logged-in user opens one lesson and one question exercise; both show interactive terminal and preserve pwd/created file state for the same course.

## Risks and Controls

- ttyd image interface differs from assumptions: pre-pull and run its documented version before enabling smoke; reject unpinned images.
- custom server affects Next dev: preserve the current Next handler for all non-terminal routes and verify dev/build/start scripts.
- a Docker internal network is not enough if a port is published: prohibit -p/--publish in runtime arg builder and assert it in tests.
- application crash cannot execute signal handlers: startup reaper removes stale labeled containers; persistent project records drive TTL volume cleanup.
- test environment may lack pre-pulled image: unit tests use injected Docker exec; smoke remains opt-in and reports a clear skip condition.

## Retirement

- Retire only mock terminal start/stop/output/copy behavior after the real terminal component has both callers and verification.
- Keep existing one-shot sandbox runner untouched; it remains the canonical owner for code execution tests.
- No compatibility adapter between mock and ttyd is retained.

## Execution Readiness View

- Intent Lock: real, shared, restricted Docker ttyd terminal for authenticated learners.
- Scope Fence: no automatic image pull, no public Docker ports, no host mounts, no Docker socket, no unrelated auth/curriculum rewrites.
- Baseline Lock: preserve existing sandbox and session owners.
- Task Batches: runtime -> proxy -> frontend -> integration/review.
- Test Obligations: one shared runtime suite, one lesson smoke, one question exercise smoke, one Docker opt-in smoke.
- Review Gates: runtime arg review before image pull; final security/diff review before completion.
- Drift / Rewind: stop if ttyd requires a public port, a host mount, an unpinned image, an unsupported custom-server behavior, or a new dependency.
- Evidence Required Before Completion: tests/build/diff check plus documented Docker smoke output.

## Execution Route

- Decision: subagent-driven.
- Evidence: tasks have bounded, non-overlapping ownership and dependency edges.
- Fallback: captain completes the same task inline if an assigned member fails or returns an unreviewable diff.
- User confirmation required: no.
