# TQ-03 一手资料核验

核验日期：2026-08-11

核验范围为 [`src/server/curriculum/data/index.ts`](../src/server/curriculum/data/index.ts) 中的 7 个课时。课时结构与证据要求来自本地 [`docs/teaching-quality-contract.md`](teaching-quality-contract.md)，它是教学契约，不作为外部技术事实来源。下表只引用规范、官方文档或项目维护方文档；后三课正文已有“资料依据”，这里仅建立断言与用途的追溯关系。

## 仓库与运行时版本基线

核验时使用仓库 [`package-lock.json`](../package-lock.json) 锁定的 Next.js 16.3.0、React 19.2.8、Drizzle ORM 0.45.2 和 Vitest 4.1.10；共享 junction 中实际解析出的包版本与锁文件一致。本机验证运行时为 Node.js 24.18.0。课程正文把 Node.js 20 作为最低版本，示例只使用 Node.js 20 已提供的能力；Next.js Route Handler 与动态参数写法另按本地 16.3.0 指南核对。

Express、PostgreSQL、Git、Docker/Compose 与 Kubernetes 不是当前仓库依赖，因此不能从锁文件推断版本。相关课程断言只采用下列稳定规范或官方文档，不声称已在本工作树执行这些外部工具；落地项目应在环境清单中另行固定版本并复验。

## `s1-dev-environment`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| `git add` 把指定路径的当前内容加入索引，提交前应审查暂存内容。 | [Git `git-add` reference](https://git-scm.com/docs/git-add) | 支持“初始化、暂存并提交”步骤及练习中的 `git diff --cached` 证据链。 |
| `git status` 显示工作树与索引相对提交历史的状态；`git log` 用于查看提交历史。 | [Git `git-status` reference](https://git-scm.com/docs/git-status)、[Git `git-log` reference](https://git-scm.com/docs/git-log) | 支持用工作树干净状态和最新提交证明基线已建立。 |
| `git rev-parse --show-toplevel` 显示工作树顶层目录。 | [Git `git-rev-parse` reference](https://git-scm.com/docs/git-rev-parse) | 支持诊断在错误目录初始化仓库，并将仓库边界与当前路径交叉核对。 |
| 命令查找依赖 `PATH`；PowerShell 与 Unix shell 分别提供命令定位工具。 | [PowerShell `Get-Command`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/get-command)、[POSIX `command`](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/command.html) | 支持跨 Windows/Unix 记录实际命令路径，区分“未安装”和“命中了旧版本”。 |

## `s2-vanilla-js`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| `localStorage` 按源提供持久化的键值存储；其值通过 `Storage` 接口以字符串读写。 | [WHATWG HTML Standard: Web storage](https://html.spec.whatwg.org/multipage/webstorage.html) | 支持刷新恢复，以及用版本化键迁移旧工单数据；结构合法性仍需应用自行校验。 |
| `textContent` 写入文本，而 `innerHTML` 会把字符串解析为 HTML，并存在注入风险。 | [MDN `Node.textContent`](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)、[MDN `Element.innerHTML`](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) | 支持把用户输入按纯文本渲染，并用类似 HTML 的输入验证不会创建元素。 |
| `crypto.randomUUID()` 使用密码学安全随机数生成 v4 UUID。 | [MDN `Crypto.randomUUID()`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) | 支持给本地工单和迁移后的旧记录分配不依赖数组位置的稳定 id。 |
| `JSON.parse` 对非法 JSON 抛出 `SyntaxError`；事件冒泡允许在共同祖先处理子项事件。 | [MDN `JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)、[MDN Event bubbling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling) | 支持损坏存储数据的回退诊断，以及事件委托实现频繁重绘列表。 |

## `s3-react`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| 需要协调多个组件的状态应提升到最近公共父组件，通过 props 向下传递数据和事件处理器。 | [React: Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | 支持由 `TicketBoard` 持有工单与筛选状态，以及“数据向下、事件向上”的组件边界。 |
| React 状态中的数组应视为只读，并通过 `map`、`filter`、展开等方式产生新数组。 | [React: Updating Arrays in State](https://react.dev/learn/updating-arrays-in-state) | 支持按 id 切换、删除工单的不可变更新，以及纯函数测试中的输入不变断言。 |
| 列表项的 key 必须在兄弟项之间唯一且保持稳定，不能在渲染时临时生成。 | [React: Rendering Lists](https://react.dev/learn/rendering-lists) | 支持使用 `ticket.id` 作为 key，避免筛选、删除后组件身份错位。 |
| `useState` 支持惰性初始化，`useEffect` 用于与组件外部系统同步。 | [React `useState`](https://react.dev/reference/react/useState)、[React `useEffect`](https://react.dev/reference/react/useEffect) | 支持一次性读取旧 `localStorage`，并把持久化写入放在明确的 effect 边界。 |

## `s4-node-postgres`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| Express 路由按 HTTP 方法和路径定义处理器，错误可交给错误处理中间件。 | [Express routing guide](https://expressjs.com/en/guide/routing.html)、[Express error handling guide](https://expressjs.com/en/guide/error-handling.html) | 支持 CRUD 路由与仓储分层，并让数据库异常进入统一错误响应而不是伪装成空数组。 |
| PostgreSQL 的主键、外键、唯一与检查约束用于维护数据完整性。 | [PostgreSQL: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) | 支持把工单归属、非空和唯一性等规则写入 schema，而不只依赖路由校验。 |
| PostgreSQL 事务把多条语句作为全有或全无的操作，并可回滚失败变更。 | [PostgreSQL: Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) | 支持审计写入和迁移步骤的原子性验证，并说明何时不能只依赖单条应用调用。 |
| 查询参数应与 SQL 文本分离，避免把用户输入拼接进查询字符串。 | [node-postgres: Queries](https://node-postgres.com/features/queries) | 支持仓储层使用参数化查询，并检查所有输入都通过绑定参数进入 SQL。 |
| HTTP 方法和状态码表达资源操作及成功、无资源、非法输入等结果类别。 | [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) | 支持接口契约中 `201`、`404`、`422` 等可观察响应，而不是让客户端猜测错误。 |
| Drizzle 的迁移文件记录 schema 变更，可在环境中按版本应用。 | [Drizzle ORM: Migrations](https://orm.drizzle.team/docs/migrations) | 支持“生成、阅读并提交迁移”步骤，说明其相对直接 push 的审查和重放价值。 |

## `s4-auth-authorization`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| Node.js `crypto` 提供 `scrypt`、密码学安全随机字节和常量时间比较等密码学原语。 | [Node.js Crypto API](https://nodejs.org/api/crypto.html) | 支持带随机 salt 的密码派生、随机 session token 和密码验证；课程仍要求按 OWASP 指南选择参数，不自创算法。 |
| `HttpOnly`、`Secure`、`SameSite`、`Expires`/`Max-Age` 分别约束 cookie 的脚本访问、传输、跨站发送和生命周期。 | [MDN `Set-Cookie`](https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Set-Cookie) | 支持服务端 session cookie 的属性选择，并强调这些属性不能互相替代。 |
| 授权应默认拒绝、在每次请求中校验，并对具体对象实施权限检查。 | [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 支持所有工单查询同时使用 `ticket.id` 与当前用户 `ownerId`，以及跨用户回归测试。 |
| 登录错误不应泄露账号是否存在，密码应使用适合密码存储的现代哈希方案。 | [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) | 支持统一未知邮箱/错误密码响应，以及不同用户使用独立 salt 的验证。 |
| 会话应支持失效/撤销，Cookie 防护不能替代 CSRF 防护。 | [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) | 支持过期与登出练习，并标明 SameSite 不是完整 CSRF 防护；TQ-03 未设置独立的 CSRF 练习，不把该链接误报为练习证据。 |

## `s4-testing-ci`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| Vitest 提供测试、断言、mock 和覆盖率等能力，测试文件可由 CLI 在 CI 中运行。 | [Vitest Guide](https://vitest.dev/guide/) | 支持从纯函数单测到真实数据库集成测试的分层策略，并复用项目测试脚本。 |
| GitHub Actions 工作流声明触发器、权限、job、step 和依赖关系；仓库权限可以显式收窄。 | [GitHub Actions workflow syntax](https://docs.github.com/actions/writing-workflows/workflow-syntax-for-github-actions) | 支持仅验证代码的最小 CI：PR/main 触发、`contents: read`、失败即停止。 |
| `actions/setup-node` 可选择 Node 版本并配置包管理器缓存。 | [`actions/setup-node`](https://github.com/actions/setup-node) | 支持在 CI 固定项目 Node 主版本并启用 npm cache。 |
| `npm ci` 要求已有锁文件，在依赖清单与锁文件不一致时失败，并在安装前移除已有 `node_modules`。 | [npm `ci`](https://docs.npmjs.com/cli/commands/npm-ci) | 支持干净 runner 上可复现的依赖安装和锁文件漂移门禁；该命令只出现在教学 CI，不要求在当前 junction 工作树执行。 |

## `s4-docker-deployment`

| 教学断言 | 一手来源 | 在课程中的用途 |
|---|---|---|
| 多阶段 Dockerfile 可以从前一阶段只复制所需构建产物，减少最终镜像中的构建工具和文件。 | [Docker: Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)、[Dockerfile overview](https://docs.docker.com/build/concepts/dockerfile/) | 支持依赖/构建/运行阶段分离，以及检查运行镜像只含生产所需产物。 |
| Compose 默认网络允许服务按服务名发现彼此；容器内 `localhost` 指向容器自身。 | [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) | 支持应用使用 `db` 服务名连接 PostgreSQL，并诊断 `127.0.0.1:5432` 拒绝连接。 |
| Compose 可依据依赖服务的 healthcheck 延迟启动依赖方，但运行中的应用仍需处理暂时连接失败。 | [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) | 支持 `service_healthy` 启动顺序，并明确“容器已启动”不等于依赖已就绪。 |
| Docker secrets 只在被授权的服务中以运行时挂载方式提供；秘密不应写入镜像或源码。 | [Docker secrets](https://docs.docker.com/engine/swarm/secrets/) | 支持区分普通配置与密码/令牌；Compose 结构检查只展开非秘密示例值，不捕获加载真实秘密后的配置输出。 |
| 健康检查应区分进程存活和是否可以接收流量；数据 schema 变更应先扩展兼容面，再收缩旧字段。 | [Kubernetes liveness/readiness probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)、[Prisma expand-and-contract pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern) | 支持分别设计 `/health/live` 与 `/health/ready`，并为旧 SHA 回滚保留兼容迁移窗口。 |

## 核验结论

- 7 个课时的核心技术断言均能追溯到规范、官方文档或项目维护方文档。
- 后三课正文列出的 Node.js、MDN、OWASP、Vitest、GitHub、npm 与 Docker 链接均属于允许的一手资料范围。
- 前四课正文没有独立的“资料依据”段落；上表补充的是审计追溯关系，不表示这些链接已经展示在课时页面中。
- `SameSite` 不能单独替代 CSRF 校验、Compose 启动顺序不能替代应用重试、`npm ci` 会移除既有 `node_modules`，这些边界在课程中必须保留，避免把官方机制描述成更强的保证。
