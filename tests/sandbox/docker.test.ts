// RB-05：createDockerExec 的 abort/硬超时修复独立单测。
// 直接用 createDockerExec + /tmp 临时 fake 二进制（shell 脚本）走真实 spawn / 进程组 /
// stdio 销毁 / 即时 settle 路径；不依赖 docker 守护进程，任何环境（含 CI）都能运行。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDockerExec } from "@/server/sandbox/docker";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-docker-unit-"));

afterAll(() => {
  // 只清理本文件自建的临时目录（受控删除，不用 rm -rf 命令）。
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** 在自建临时目录写一个可执行的 fake 二进制（shell 脚本）。 */
function writeFakeBinary(name: string, body: string): string {
  const file = path.join(tmpRoot, name);
  fs.writeFileSync(file, `#!/bin/sh\nset -u\n${body}\n`, { mode: 0o755 });
  return file;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询等待文件出现并返回内容（上限 timeoutMs，避免测试挂死）。
 * 空文件视为未就绪继续轮询：`echo $$ > file` 先创建文件再写入，避免读到空内容的竞态。 */
async function waitForFile(file: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = fs.readFileSync(file, "utf8").trim();
      if (content.length > 0) return content;
    } catch {
      /* 文件尚未创建 */
    }
    await sleep(25);
  }
  throw new Error(`等待文件超时：${file}`);
}

/** 轮询确认进程已退出：process.kill(pid, 0) 抛 ESRCH 即认为退出。上限内返回 true。 */
async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    }
    await sleep(50);
  }
  return false;
}

describe("createDockerExec 硬超时 / AbortSignal 中止（fake 二进制）", () => {
  it("硬超时：fake sleep 5 + timeoutMs 300 → 快速 resolve、timedOut=true、code=null、不挂起", async () => {
    const binary = writeFakeBinary("sleep5.sh", 'sleep 5\necho "should not print"');
    const exec = createDockerExec(binary);
    const started = Date.now();
    const result = await exec(["x"], { timeoutMs: 300 });
    const elapsed = Date.now() - started;

    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
    expect(result.signal).toBe("SIGKILL");
    // 约 300ms 触发；宽松上限 2s，仍远小于 sleep 5，证明没有等待子进程自然退出。
    expect(elapsed).toBeLessThan(2_000);
  }, 10_000);

  it("AbortSignal 中止：手动 abort → 快速 resolve、timedOut=true，直接子进程被清理", async () => {
    const pidfile = path.join(tmpRoot, `abort-${process.pid}-${Date.now()}.pid`);
    const binary = writeFakeBinary("long.sh", `echo $$ > "${pidfile}"\nsleep 60`);
    const ac = new AbortController();
    const exec = createDockerExec(binary);
    const promise = exec([], { signal: ac.signal });

    // 等子进程（fake 脚本本体）真正启动并写入自己的 pid，避免在 spawn 完成前 abort 的竞态。
    const childPid = Number((await waitForFile(pidfile)).trim());
    expect(Number.isInteger(childPid)).toBe(true);
    expect(childPid).toBeGreaterThan(0);

    const started = Date.now();
    ac.abort();
    const result = await promise;
    const elapsed = Date.now() - started;

    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
    expect(elapsed).toBeLessThan(2_000);

    // 直接子进程也应退出（不残留孤儿）
    const exited = await waitForProcessExit(childPid, 5_000);
    expect(exited, `直接子进程 ${childPid} 在 abort 后 5s 内未退出`).toBe(true);
  }, 15_000);

  it("包装脚本 + 孙进程：abort 后进程组被清理，后台 sleep 60 孙进程退出、无孤儿", async () => {
    const pidfile = path.join(tmpRoot, `grandchild-${process.pid}-${Date.now()}.pid`);
    const binary = writeFakeBinary(
      "wrapper.sh",
      `sleep 60 &\nGCHILD=$!\necho $GCHILD > "${pidfile}"\nwait`,
    );
    const ac = new AbortController();
    const exec = createDockerExec(binary);
    const promise = exec(["wait", "container-id"], { signal: ac.signal });

    // 等孙进程（后台 sleep）启动并写入 pid；确保 abort 发生时它确实存活。
    const grandchildPid = Number((await waitForFile(pidfile)).trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);
    expect(grandchildPid).toBeGreaterThan(0);
    expect(process.kill(grandchildPid, 0)).toBe(true);

    ac.abort();
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();

    // 轮询确认孙进程退出（进程组 SIGKILL 应带走后台 sleep）；轮询有上限并给出明确失败信息。
    const exited = await waitForProcessExit(grandchildPid, 5_000);
    expect(exited, `孙进程 ${grandchildPid} 在 abort 后 5s 内未退出：进程组清理失败，存在孤儿进程`).toBe(true);
  }, 15_000);
});

describe("createDockerExec 正常路径与 spawn 失败（fake 二进制）", () => {
  it("正常退出 0：code=0、stdout/stderr 被采集、timedOut=false", async () => {
    const binary = writeFakeBinary(
      "ok.sh",
      'echo "out line 1"\necho "out line 2"\necho "err line" >&2\nexit 0',
    );
    const exec = createDockerExec(binary);
    const result = await exec(["version"]);

    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.stdout).toContain("out line 1");
    expect(result.stdout).toContain("out line 2");
    expect(result.stderr).toContain("err line");
  });

  it("非 0 退出码正确透传", async () => {
    const binary = writeFakeBinary("fail.sh", 'echo "boom" >&2\nexit 7');
    const exec = createDockerExec(binary);
    const result = await exec(["wait", "cid"]);

    expect(result.code).toBe(7);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain("boom");
  });

  it("二进制不存在：resolve 且 error 已设置（不 reject、不挂起）", async () => {
    const missing = path.join(tmpRoot, `no-such-docker-binary-${Date.now()}`);
    const exec = createDockerExec(missing);
    const started = Date.now();
    const result = await exec(["version"]);
    const elapsed = Date.now() - started;

    expect(result.error).toBeInstanceOf(Error);
    expect(result.code).toBeNull();
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(elapsed).toBeLessThan(2_000);
  }, 10_000);
});

describe("createDockerExec abort 幂等（可选）", () => {
  it("abort 后只 settle 一次：重复 abort 不抛错，再次 await 仍是同一结果", async () => {
    // 说明取舍：Promise 的 resolve 只能发生一次，JS 层面无法直接观测“第二次 resolve”。
    // 等价断言：settle 后再次 abort 无副作用（幂等、不抛错），且多次 await 返回同一结果对象。
    const pidfile = path.join(tmpRoot, `idem-${process.pid}-${Date.now()}.pid`);
    const binary = writeFakeBinary("idem.sh", `echo $$ > "${pidfile}"\nsleep 60`);
    const ac = new AbortController();
    const exec = createDockerExec(binary);
    const promise = exec([], { signal: ac.signal });

    await waitForFile(pidfile);
    ac.abort();
    const first = await promise;

    expect(first.timedOut).toBe(true);
    expect(() => ac.abort()).not.toThrow();
    const again = await promise;
    expect(again).toBe(first);
  }, 10_000);
});
