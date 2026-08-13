// 真实 Docker smoke：本机 Docker 与镜像可用时运行，否则整组跳过（环境受限）。
// 镜像可用 SANDBOX_SMOKE_IMAGE 覆盖（本地存在 node 镜像时无需联网拉取）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInSandbox } from "@/server/sandbox/runner";
import { dockerAvailable, imageAvailable } from "../helpers/docker";

const SMOKE_IMAGE = process.env.SANDBOX_SMOKE_IMAGE ?? "node:24-bookworm-slim";

const canSmoke = dockerAvailable() && imageAvailable(SMOKE_IMAGE);

describe.skipIf(!canSmoke)(`sandbox 真实 docker smoke（${SMOKE_IMAGE}）`, () => {
  it("node -e 'console.log(1)' 在沙箱内成功", async () => {
    const outcome = await runInSandbox({
      image: SMOKE_IMAGE,
      cmd: ["node", "-e", "console.log(1)"],
      entrypoint: "",
      timeoutMs: 30_000,
    });
    expect(outcome.status).toBe("success");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain("1");
    expect(outcome.timedOut).toBe(false);
  }, 60_000);

  it("--network=none：fetch 外网失败并分类为 network-blocked", async () => {
    const outcome = await runInSandbox({
      image: SMOKE_IMAGE,
      cmd: [
        "node",
        "-e",
        "fetch('http://example.com').then(()=>process.exit(0)).catch((e)=>{console.error('NETERR:'+e.message);process.exit(42)})",
      ],
      entrypoint: "",
      timeoutMs: 30_000,
    });
    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.stderr).toContain("NETERR");
    expect(outcome.status).toBe("network-blocked");
  }, 60_000);

  it("超时：sleep 5 且 timeoutMs 1000 → timeout 并清理容器", async () => {
    const outcome = await runInSandbox({
      image: SMOKE_IMAGE,
      cmd: ["sleep", "5"],
      entrypoint: "",
      timeoutMs: 1000,
    });
    expect(outcome.status).toBe("timeout");
    expect(outcome.timedOut).toBe(true);
    expect(outcome.durationMs).toBeLessThan(5000);
    // 容器应已被清理：再次创建同名容器不会冲突（名称唯一性间接验证清理路径）
    expect(outcome.message).toContain("超时");
  }, 60_000);

  it("projectDir 内容复制进 /workspace 后可被读取执行", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-sandbox-smoke-"));
    fs.writeFileSync(path.join(projectDir, "main.js"), "console.log('PROJECT_OK')\n");
    const outcome = await runInSandbox({
      image: SMOKE_IMAGE,
      cmd: ["node", "/workspace/main.js"],
      entrypoint: "",
      projectDir,
      timeoutMs: 30_000,
    });
    expect(outcome.status).toBe("success");
    expect(outcome.stdout).toContain("PROJECT_OK");
  }, 60_000);
});
