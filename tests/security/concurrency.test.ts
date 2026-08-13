// P2-07 并发/资源隔离回归：沙箱运行彼此独立，参数不共享可变状态；
// 容器名唯一；项目目录校验拒绝文件路径（防止误把文件当目录 cp）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runInSandbox, generateContainerName } from "@/server/sandbox/runner";
import { SandboxConfigError } from "@/server/sandbox/errors";
import type { DockerCommandResult, DockerExec } from "@/server/sandbox/docker";

function result(overrides: Partial<DockerCommandResult> = {}): DockerCommandResult {
  return { stdout: "", stderr: "", code: 0, signal: null, timedOut: false, ...overrides };
}

describe("并发与资源隔离（P2-07）", () => {
  it("并行运行使用唯一容器名，互不覆盖", async () => {
    const names: string[] = [];
    const exec: DockerExec = vi.fn(async (args: string[]) => {
      if (args[0] === "create") names.push(args[args.indexOf("--name") + 1]);
      if (args[0] === "create") return result({ stdout: "id\n" });
      if (args[0] === "wait") return result({ stdout: "0\n" });
      if (args[0] === "inspect") return result({ stdout: "false 0 false\n" });
      return result();
    }) as unknown as DockerExec;

    await Promise.all([
      runInSandbox({ image: "x", cmd: ["true"], docker: exec }),
      runInSandbox({ image: "x", cmd: ["true"], docker: exec }),
      runInSandbox({ image: "x", cmd: ["true"], docker: exec }),
    ]);
    expect(new Set(names).size).toBe(3);
  });

  it("projectDir 必须是目录，文件路径抛 SandboxConfigError（防误复制）", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qz-conc-")), "f.txt");
    fs.writeFileSync(file, "x");
    await expect(runInSandbox({ image: "x", cmd: ["true"], projectDir: file })).rejects.toThrow(SandboxConfigError);
  });

  it("容器名格式稳定且带随机后缀", () => {
    expect(generateContainerName()).toMatch(/^quanzhan-sandbox-[a-z0-9]+-[a-f0-9]{8}$/);
  });
});
