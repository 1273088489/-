// RB-03 真实 Docker smoke：带依赖 Node 项目在 --network=none 沙箱内
// 用宿主预取 npm 离线缓存完成 npm ci → build → test 全绿；
// 缺缓存时诚实失败（network-blocked，不伪造 success）；运行前后无残留沙箱容器。
// 环境受限（docker / 镜像 / 离线缓存缺失）时整组跳过（skip 是预期）。
// 注意：本地 smoke 镜像 quanzhan-node-offline:local 继承 auto-cut/control-plane:local，
// 自带 NODE_ENV=production 会跳过 devDependencies → 配置必须 env: { NODE_ENV: "development" }
// （生产默认 node:24 镜像不设 NODE_ENV，无此问题，见 docs/sandbox-execution.md）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProjectInSandbox } from "@/server/runner/orchestrator";
import { dockerAvailable, imageAvailable, listSandboxContainers } from "../helpers/docker";

const SMOKE_IMAGE = process.env.SANDBOX_SMOKE_IMAGE ?? process.env.SANDBOX_IMAGE ?? "quanzhan-node-offline:local";
const FIXTURE_DIR = path.resolve(import.meta.dirname, "../../.scratch/phase2-routeB/fixtures/deps-project");
const NPM_OFFLINE_CACHE_ENV = "SANDBOX_NPM_OFFLINE_CACHE";

/** 离线缓存 env 可用：非空且指向存在、非空的目录。 */
function offlineCacheReady(): boolean {
  const dir = process.env[NPM_OFFLINE_CACHE_ENV];
  if (!dir || dir.trim() === "") return false;
  try {
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

const canSmoke = dockerAvailable() && imageAvailable(SMOKE_IMAGE) && offlineCacheReady();

/** 把 fixture 复制到独立临时目录（排除 node_modules，避免带入宿主安装产物）。 */
function copyFixtureToTemp(): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-offline-smoke-"));
  for (const entry of fs.readdirSync(FIXTURE_DIR)) {
    if (entry === "node_modules") continue;
    fs.cpSync(path.join(FIXTURE_DIR, entry), path.join(dest, entry), { recursive: true });
  }
  return dest;
}

/**
 * 断言某次运行自身创建的容器已被 runner finally rm（无残留）。
 * 只过滤本测试运行创建的容器（outcome.raw.containerName），不与全局容器列表比较：
 * 其它 smoke 文件在 vitest fileParallelism 下并行运行，会并发创建/清理容器，
 * 全局数量/名单比较会误报；过滤自身容器是确定性的等价检查。
 */
function expectNoResidualContainer(containerName?: string): void {
  if (!containerName) return;
  expect(listSandboxContainers()).not.toContain(containerName);
}

/** 用例 A：缓存命中 —— 全链路成功，阶段全绿，无残留容器。返回本次运行容器名。 */
async function runCacheHitCase(): Promise<string | undefined> {
  const projectDir = copyFixtureToTemp();
  let outcome: Awaited<ReturnType<typeof runProjectInSandbox>>;
  try {
    outcome = await runProjectInSandbox({
      projectDir,
      // 不显式传 offlineCache → 走环境变量 SANDBOX_NPM_OFFLINE_CACHE。
      config: { runtime: "node", image: SMOKE_IMAGE, env: { NODE_ENV: "development" }, timeoutMs: 180_000 },
    });
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  expect(outcome.status).toBe("success");
  expect(outcome.exitCode).toBe(0);
  expect(outcome.phases.map((p) => p.phase)).toEqual(["install", "build", "test"]);
  expect(outcome.phases.every((p) => !p.skipped && p.exitCode === 0)).toBe(true);
  // node --test 通过标记：2 个用例 → "ok 1" 与 "pass 2"
  expect(outcome.stdout).toContain("ok 1");
  expect(outcome.stdout).toContain("pass 2");
  // install 阶段 stdout 含 npm 安装计数（证明缓存命中并完成安装）
  expect(outcome.phases[0]?.stdout).toContain("added");
  expectNoResidualContainer(outcome.raw?.containerName);
  return outcome.raw?.containerName;
}

/** 用例 B：缺缓存诚实失败 —— 空离线缓存目录 → 不带 --offline → npm 触网失败。返回本次运行容器名。 */
async function runNoCacheCase(): Promise<string | undefined> {
  const projectDir = copyFixtureToTemp();
  const emptyCache = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-offline-empty-"));
  let outcome: Awaited<ReturnType<typeof runProjectInSandbox>>;
  try {
    outcome = await runProjectInSandbox({
      projectDir,
      config: { runtime: "node", image: SMOKE_IMAGE, env: { NODE_ENV: "development" }, timeoutMs: 180_000 },
      offlineCache: { hostDir: emptyCache, containerPath: "/workspace/.quanzhan-offline" },
    });
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(emptyCache, { recursive: true, force: true });
  }

  // 空缓存 → offlineCacheUsable=false → 不追加 --offline → 沙箱 --network=none 下 npm 触网失败。
  expect(outcome.status).toBe("network-blocked");
  expect(outcome.status).not.toBe("success");
  expect(outcome.exitCode).not.toBe(0);
  expect(outcome.phases.find((p) => p.phase === "install")?.exitCode).not.toBe(0);
  expectNoResidualContainer(outcome.raw?.containerName);
  return outcome.raw?.containerName;
}

describe.skipIf(!canSmoke)(`RB-03 离线依赖沙箱 smoke（${SMOKE_IMAGE}）`, () => {
  it("缓存命中：deps-project 在 --network=none 内 npm ci → build → test 全绿", async () => {
    await runCacheHitCase();
  }, 180_000);

  it("缺缓存诚实失败：空离线缓存目录 → network-blocked，install 阶段非 0，不伪造 success", async () => {
    await runNoCacheCase();
  }, 180_000);

  it("无残留容器：A/B 各自创建的容器被 runner finally rm（前后名单不含自身容器）", async () => {
    const hitContainer = await runCacheHitCase();
    const failContainer = await runNoCacheCase();
    expectNoResidualContainer(hitContainer);
    expectNoResidualContainer(failContainer);
  }, 360_000);
});
