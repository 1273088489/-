# 沙箱执行设计（P2-03）

> 状态：已实现（2026-08-12）
> 范围：`src/server/runner/`（配置 / 适配器 / 编排器 / 物化）
> 对应票据：`.scratch/phase2/issues/03-sandbox-execution.md`
> 依赖：P2-01 `src/server/sandbox/`（runInSandbox）、P2-02 `src/server/repo/`（clone/extract）

## 1. 目标与安全边界

仓库快照（P2-02 解析产物）在受限 Docker 容器中按项目配置执行：

- Node 项目：`npm ci`（无 lockfile 时 `npm install`）→ 存在 build script 时 `npm run build` → 存在 test script 时 `npm test`。
- Static 项目：`verify` 阶段用固定命令校验文件已复制进沙箱（不执行仓库代码）。
- 收集逐阶段 stdout/stderr/exitCode/duration；整体错误分类复用 P2-01（timeout / oom / network-blocked / runtime-error / infra-unavailable）。
- 主进程只读取仓库文件判断脚本存在性，**绝不直接执行仓库代码**；执行统一经 `runInSandbox`。

## 2. 数据流

```
提交（repoUrl / archive）
  → P2-02 ingestRepository（解析 → repository_submission.parsed）
  → P2-03 materializeRepository（重新克隆/解包到隔离临时目录）
  → resolveProjectSandboxConfig（stage_project.sandbox_config + 默认值）
  → planPhases（node/static 适配器 → 阶段计划）
  → runProjectInSandbox（单容器顺序执行 install/build/test/verify，脚本标记拆分证据）
  → 持久化 sandbox_run（status/errorCode/exitCode/stdout/stderr/phases/duration/…）
  → API 返回 { attempt, repository, sandboxRun }；infra-unavailable 返回 502
```

- 一次沙箱运行 = 一个一次性容器（`--network=none --memory=512m --cpus=1 --pids-limit=64 --read-only` + 匿名可写 `/workspace`），阶段共享 node_modules。
- 阶段以 POSIX sh 脚本顺序执行（fail-fast），脚本由可信配置生成，参数经 `shellQuote` 单引号转义；
  脚本通过 `__QZ_PHASE_*__` 标记把合并输出拆回各阶段（/tmp 为可写 scratch，noexec）。
- `npm ci` 在 `--network=none` 下仅对**零依赖**项目可用；有依赖时若未配置离线缓存（Route B），npm 触网失败 → 分类 `network-blocked`（诚实记录，不伪造成功）。

## 3. 项目级配置

课程数据 `StageProjectDef.sandbox`（seed 到 `stage_project.sandbox_config` JSON）：

```jsonc
{ "runtime": "node",          // node | static；缺省按仓库结构自动检测
  "image": "node:24-bookworm-slim", // 可选，覆盖 SANDBOX_IMAGE 默认值
  "install": ["npm", "ci"],   // argv；null 跳过；缺省按 lockfile 选择 ci/install
  "build": ["npm", "run", "build"], // null 跳过；缺省：存在 build script 时执行
  "test": ["npm", "test"],    // null 跳过；缺省：存在 test script 时执行
  "timeoutMs": 60000,         // 1_000..600_000
  "memoryMb": 512,            // 64..2048
  "env": {} }
```

配置来源是课程数据（可信），学习者仓库不能注入任意配置；解析失败时回退默认值。

## 4. 错误分类与降级

- 容器级失败复用 P2-01：OOM（容器状态/特征文本）→ `oom`；网络特征 → `network-blocked`；其余非零退出码 → `runtime-error`。
- 超时 → `timeout`；docker CLI/守护进程/镜像缺失 → `infra-unavailable`。
- Docker 不可用：不执行任何宿主命令，API 返回 502 `{ code: "sandbox-infra-unavailable", sandboxRun }`，并持久化失败记录。
- 物化失败（第二次克隆/解包失败）：持久化 `status=failed` 记录并随 200 返回，便于学习者看到原因。

## 5. 验证

- 单元测试（fake docker）：`tests/runner/{config,adapters,orchestrator}.test.ts`。
- 真实沙箱 smoke：`tests/runner/execution.test.ts`（Docker + 本地镜像可用时运行；镜像可用 `SANDBOX_IMAGE`/`SANDBOX_SMOKE_IMAGE` 覆盖，如 `auto-cut/control-plane:local`）。
- 覆盖：零依赖 Node 项目 npm ci + npm test 通过、测试红分类 runtime-error、static verify、超时/网络/OOM/基础设施不可用分类。

## 6. 离线依赖缓存（Route B）

> 状态：已实现（2026-08-12）
> 对应票据：`.scratch/phase2-routeB/issues/03-fixture-smoke-docs.md`
> 模块：`src/server/runner/offline-cache.ts`、`src/server/runner/orchestrator.ts`、`src/server/sandbox/runner.ts`（copyDirs）

### 6.1 机制

带依赖的真实 Node 项目在 `--network=none` 沙箱内也能完成 `npm ci → build → test`：

1. **宿主预取**：管理员/CI 在带网络主机上对目标项目执行一次 `npm ci --cache <hostCacheDir>`，
   得到内容寻址的 npm 离线缓存目录（小项目仅几 MB）。
2. **运行期接线**：`runProjectInSandbox` 解析 `SANDBOX_NPM_OFFLINE_CACHE`（或显式 `offlineCache` 覆盖），
   缓存存在且非空时：
   - 经 `copyDirs` 用 `docker cp` 把缓存目录内容复制进容器**可写**的 `/workspace/.quanzhan-offline`
     （非宿主挂载、非镜像内置）；
   - install 阶段命令追加 `--offline --cache=/workspace/.quanzhan-offline`；
   - 容器 env 追加 `npm_config_cache`、`npm_config_offline=true`、`npm_config_prefer_offline=true`
     （离线配置为强制项，覆盖课程配置同名键）。
3. 沙箱仍保持 `--network=none`，资源限制不变；不引入内网 registry 代理。

### 6.2 运维配置

| 环境变量 | 说明 |
| --- | --- |
| `SANDBOX_NPM_OFFLINE_CACHE` | 宿主 npm 离线缓存目录（存在且非空才启用；未设置/为空 → 不启用，行为与现状一致） |
| `SANDBOX_DOCKER_BINARY` | docker 可执行文件（默认 `docker`），受限环境可指向 `sudo -n docker` 包装脚本 |
| `SANDBOX_IMAGE` / `SANDBOX_SMOKE_IMAGE` | 沙箱镜像 / smoke 镜像覆盖（仅测试与部署配置） |

预取命令示例（在项目目录内，需网络）：

```sh
npm ci --cache /var/cache/quanzhan-npm-offline --no-audit --no-fund
```

仓库内附带可重复脚本（`.scratch/phase2-routeB/scripts/`）：

```sh
.scratch/phase2-routeB/scripts/prepare-offline-cache.sh /tmp/qz-fixture-cache   # 预取（幂等；缓存已存在时离线校验）
SANDBOX_DOCKER_BINARY=/tmp/qz-docker .scratch/phase2-routeB/scripts/build-smoke-image.sh  # 构建本地 smoke 镜像（幂等）
```

### 6.3 缺缓存诚实失败

- 缓存目录缺失/为空（或 env 未设置）：不追加 `--offline`，不复制缓存 → npm 在 `--network=none` 下触网失败 →
  错误分类**不变**为 `network-blocked`（诚实失败，不伪造 success）。
- 篡改缓存：npm cache 内容寻址 + lockfile 完整性校验，`npm ci` 校验失败 → 诚实 `runtime-error`。

### 6.4 当前仅 npm；python 后续

- 离线缓存接线只作用于 `runtime=node` 且存在 `npm` install 阶段的计划；`runtime=python` 不应用
  （python 的 pip 离线缓存留待后续，当前带依赖 python 项目保持诚实 `network-blocked`）。

### 6.5 镜像注意事项

- **非 root 用户镜像**：`copyDirs` 复制目标是容器内 `/workspace`（可写匿名卷），镜像若以非 root 用户运行，
  该用户必须对 `/workspace` 可写（本地 smoke 镜像 `quanzhan-node-offline:local` 由 `auto-cut/control-plane:local`
  派生并 `chown node:node /workspace`）。
- **`NODE_ENV=production` 镜像**：npm 会跳过 devDependencies。本地 `auto-cut/control-plane:local` 自带
  `NODE_ENV=production`，因此带 devDeps 的 smoke 配置必须 `env: { NODE_ENV: "development" }`；
  生产默认镜像 `node:24-bookworm-slim` 不设 NODE_ENV，无此问题。
