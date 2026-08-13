# 沙箱安全设计（P2-01）

> 状态：已实现（2026-08-12）
> 范围：`src/server/sandbox/`（runner / docker CLI 执行器 / 错误分类）
> 对应票据：`.scratch/phase2/issues/01-infra-sandbox-base.md`

## 1. 目标与安全边界

Phase 2 的不变量：**主进程（Next.js 服务）永不直接执行学习者代码**。学习者代码只在 Docker 一次性容器内运行；Docker 不可用时返回明确错误，**绝不回退到宿主执行，绝不伪造成功**。

本模块只负责“在受限容器里执行一条命令并返回结构化结果”，不接触项目/提交/评分（后续票据 P2-02/P2-03 接入）。

## 2. 容器资源限制

`runInSandbox` 创建容器时固定附加以下参数（默认值均可通过选项覆盖）：

| Docker 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--network none` | none | 无网络（仅 loopback），隐藏测试与安装均不触网 |
| `--memory 512m` | 512 MB | 内存硬限制，超限内核 OOM kill |
| `--cpus 1` | 1 | CPU 配额 |
| `--pids-limit 64` | 64 | 进程数上限，防 fork 炸弹 |
| `--read-only` | 开 | 根文件系统只读 |
| `--tmpfs /tmp:rw,noexec,nosuid,size=64m` | 固定 | 可写 scratch，禁止从 /tmp 执行 |
| `-v <workdir>` | `/workspace` | **匿名**可写卷：代码运行空间，不挂载宿主路径、不持久化，随容器删除 |
| `--workdir <workdir>` | `/workspace` | 容器内工作目录 |
| `--security-opt no-new-privileges` | 固定 | 禁止提权 |
| `--cap-drop ALL` | 固定 | 丢弃全部 Linux capabilities |
| `--env HOME=/tmp` | 固定 | 只读根文件系统下提供可写家目录（调用方可覆盖） |

不允许：网络、持久卷、特权容器、宿主路径挂载、`--privileged`。

## 3. 执行流

```
runInSandbox({ image, cmd, ... })
  ├─ docker create（带上述限制，--name <唯一名>）
  ├─ docker cp <projectDir>/.  <name>:/<workdir>   # 有 projectDir 时；复制而非挂载
  ├─ docker start
  ├─ docker wait（AbortSignal + 定时器实现超时）
  ├─ docker logs（stdout/stderr 分离采集，单流上限 1MB）
  ├─ docker inspect（Running / ExitCode / OOMKilled，判定退出码与 OOM）
  ├─ 超时 → docker kill（SIGKILL）
  └─ finally → docker rm -f -v（删除容器与匿名卷）
```

- 用户命令以 **argv 数组** 传入 `docker create`，不经 shell，避免命令注入。
- 环境变量 `--env KEY=VAL` 逐项传参，键名白名单校验（`[A-Za-z_][A-Za-z0-9_]*`），值禁止 `\0` / 换行。
- 超时与“恰好同时退出”存在竞态：中止 `docker wait` 后会先 `inspect`，若容器已退出则不判超时、不误杀。
- 输出采集有 1MB/流 上限，防止学习者程序刷屏撑爆宿主内存。

## 4. 错误分类

| 分类 | 判定依据 | 对外消息 |
| --- | --- | --- |
| `timeout` | `docker wait` 超时且容器仍在运行，随后 SIGKILL | 沙箱执行超时，容器已被终止 |
| `oom` | `docker inspect` 的 `OOMKilled=true`，或 stderr 含 OOM 特征 | 沙箱内存超限（OOM） |
| `network-blocked` | 容器 stderr/stdout 含网络失败特征（fetch failed、getaddrinfo ENOTFOUND、Network is unreachable 等） | 沙箱内网络访问被阻止 |
| `runtime-error` | 其余非零退出码 | 沙箱内命令执行失败（退出码 N） |
| `infra-unavailable` | docker CLI 不存在 / 守护进程不可达 / 镜像缺失（`pullImage=false` 时）/ 复制、启动、等待等基础设施步骤失败 | 沙箱不可用 |

分类规则集中在 `src/server/sandbox/errors.ts`，纯函数可单测；文本特征只做辅助判定，OOM 以容器状态（`OOMKilled`）为准。

## 5. 降级策略

- `docker create` 报“Cannot connect to the Docker daemon”等 → 返回 `infra-unavailable` 与中文错误消息，**不执行任何宿主命令**。
- 镜像缺失默认不自动拉取（避免意外网络行为）；调用方显式传 `pullImage: true` 时先 `docker pull` 再重试一次。
- 运行结果统一为 `SandboxRunResult`（`status / exitCode / stdout / stderr / durationMs / timedOut / oomKilled / message`），下游可直接消费，无需 try/catch 处理预期失败。

## 6. 使用示例

```ts
import { runInSandbox } from "@/server/sandbox";

const result = await runInSandbox({
  image: "node:24-bookworm-slim",
  cmd: ["npm", "test"],
  entrypoint: "",            // 需要时清空镜像 ENTRYPOINT
  projectDir: "/tmp/clone-abc", // 项目目录内容复制进 /workspace
  timeoutMs: 60_000,
  memoryMb: 512,
  cpus: 1,
  env: { NODE_ENV: "test" },
});
// result.status: "success" | "timeout" | "oom" | "network-blocked" | "runtime-error" | "infra-unavailable"
```

## 6.1 P2-04 隐藏测试注入说明

隐藏测试由服务端在评估时注入沙箱（`src/server/tests/`）：

- 隐藏测试内容只存在于课程数据与 `test_case` 表（服务端），不进入任何公开 API / UI / 课程数据。
- 公开与隐藏测试各自使用**独立工作区副本**：公开运行中不存在隐藏测试文件。
- 隐藏运行只执行固定测试命令（`node --test <注入文件>` 等），`install/build/test` 阶段均为 null，**绝不执行学习者 package.json 脚本**。
- 注入目录为随机命名的点目录（`.quanzhan-tests-<random>`），降低盲猜路径的风险。
- 即便学习者代码在隐藏测试导入其模块时尝试读取，沙箱 `--network=none` 使其无法外泄，`--read-only` 使其无法落盘，运行输出只入库、不返回给学习者。

## 6.2 离线依赖（Route B）

> 状态：已实现（2026-08-12）
> 对应票据：`.scratch/phase2-routeB/issues/03-fixture-smoke-docs.md`

带依赖 Node 项目在沙箱内安装依赖的信任模型与安全不变量：

- **依赖只来自宿主可信预取缓存**：沙箱内 `npm ci --offline --cache=/workspace/.quanzhan-offline` 只能命中
  管理员在带网络主机上预取的 npm cache；学习者代码无法在宿主网络下自行安装任意依赖。
- **copyDirs 仅复制到 workdir 内、不挂载**：缓存经 `docker cp` 复制进容器可写的 `/workspace/.quanzhan-offline`，
  路径必须位于 workdir 内（拒绝绝对路径逃逸、`..`、NUL/换行/控制字符）；不新增宿主挂载、不新增持久卷。
- **`--offline` 保证沙箱安装不触网**：即使镜像/缓存被替换，容器仍固定 `--network=none`；`--offline` 只是让
  npm 只读缓存，不放开沙箱网络。
- **npm cache 内容寻址 + lockfile 完整性校验**：缓存条目带完整性摘要，`npm ci` 依据 lockfile 的 sha 校验；
  缓存被篡改会导致校验失败 → 诚实 `runtime-error`（不伪造成功），比任意 tarball 镜像更可信。
- **不引入内网 registry 代理**：不新增任何宿主侧网络入口；缺缓存时保持 `network-blocked` 诚实失败语义。

## 7. 已知限制与后续

- 网络判定是启发式（stderr 特征），存在少量误报/漏报可能；网络被禁的权威证明是容器配置 `--network=none` 本身。
- `--cap-drop ALL` 会让依赖特殊 capability 的工具（如需要 raw socket 的 ping、需要 chown 的部分安装脚本）失败；v1 Node/静态栈不受影响，后续如需可放宽并在课程中说明。
- `/workspace` 使用 Docker 匿名卷（非 tmpfs 挂载点），`docker rm -v` 后即删除，无持久化、无宿主路径暴露。
- 镜像拉取走宿主 Docker 守护进程的网络，与沙箱 `--network=none` 无关。
- 测试：`tests/sandbox/errors.test.ts`、`tests/sandbox/runner.test.ts`（mock docker，无需 Docker）；`tests/sandbox/smoke.test.ts`（真实 Docker，镜像缺失自动跳过，可用 `SANDBOX_SMOKE_IMAGE` 覆盖）。

## 8. P2-07 多栈与安全加固

> 状态：已实现（2026-08-12）
> 对应票据：`.scratch/phase2/issues/07-multistack-and-hardening.md`

### 8.1 多技术栈适配（`src/server/runner/`）

- 运行时扩展为 `node | python | static`，配置字段增加 `run`（static 增强：可自定义 verify/run 命令）。
- Python 计划（`planPythonPhases`）：
  - install：`python3 -m venv .venv`（失败则回退直接用 `python3`），`pip install -r requirements.txt` 或 `pip install -e .`（无 requirements）。
  - test：pytest 缺省命令 `python3 -m pytest -q --disable-warnings`；无测试结构标记 skipped。
  - build：Python 一般不单独构建，缺省 skipped（可配置覆盖）。
  - 默认镜像 `python:3.12-slim`（`SANDBOX_PYTHON_IMAGE` 可覆盖）；`--network=none` 下带依赖安装会诚实分类为 network-blocked。
- 多结构探测（`detectProjectStructure`）：
  - 根 package.json → node；根 Python 清单（requirements/pyproject/setup/pytest.ini/tox.ini）→ python；否则 static。
  - **monorepo**：根无清单时向子目录探测（深度 ≤2，跳过 node_modules/隐藏目录），按“路径深度 + 字典序”取命中包；python 优先。
  - 无 package.json：不再简单视为 static，而是按 Python 清单与 monorepo 结构分流。

### 8.2 安全加固

- **路径**：`isUnsafeArchivePath` 额外拒绝 `./` 前缀、NUL、超长段（>255）；`extractZip` 写入前双保险校验计算出的目标路径严格位于 `destDir` 内；测试注入路径 `assertSafeRelativePath` 同样拒绝 NUL。
- **zip-slip / 符号链接 / 资源耗尽**：恶意 payload 回归集见 `tests/security/payloads.test.ts`（中央目录解析拒绝 `../`、绝对路径、盘符、反斜杠变体；符号链接条目拒绝；单文件/文件数/总大小超限拒绝），`tests/repo/archive.test.ts` 既有全覆盖。
- **命令/参数注入**：新增审计模块 `src/server/sandbox/security/audit.ts`——`auditShellArg`/`auditContainerArg`（拒绝 `--xxx` 参数形态）/`auditFilePath`/`auditEscapePayloads`；真实防线仍是 argv 数组不经 shell + `shellQuote` 单引号转义（回归见 `tests/security/sandbox-invariants.test.ts`）。
- **沙箱逃逸回归**：`ESCAPE_PAYLOADS` 覆盖 shell 命令替换/反引号/管道/路径穿越/绝对路径/换行环境变量/分号、NUL、`--network=host` 等，审计规则全部命中（`tests/security/audit.test.ts`）。
- **并发**：容器名唯一（时间戳+随机）；并行运行互不覆盖；`projectDir` 必须是目录（防止误把文件当目录复制）（`tests/security/concurrency.test.ts`）。
- **不变量**：create 参数必须含 `--network none / --memory / --cpus / --pids-limit / --read-only / --cap-drop ALL / no-new-privileges / tmpfs noexec`；docker 调用只允许白名单子命令（`tests/security/sandbox-invariants.test.ts`）。

### 8.3 验证

- 单元：`tests/security/{path-validation,payloads,archive-hardening,audit,sandbox-invariants,concurrency}.test.ts` 全部无需 Docker。
- 回归：`tests/runner/adapters.test.ts` 覆盖 python/monorepo/无 package.json/static run 覆盖。
- 真实沙箱 python smoke 受镜像可用性限制：本机 `python:3.12-slim` 无法拉取且本地镜像无 python3，因此 python 真实运行未执行；适配器命令计划、配置校验与编排路径已用 mock docker 全量覆盖。
