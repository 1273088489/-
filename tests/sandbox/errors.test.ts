// 沙箱错误分类纯函数测试：不依赖 docker，验证 timeout/oom/network-blocked/runtime-error/infra-unavailable 判定。
import { describe, expect, it } from "vitest";
import {
  SandboxError,
  classifyContainerFailure,
  classifyDockerCommandFailure,
  looksLikeImageMissing,
  looksLikeInfraUnavailable,
  looksLikeNetworkBlocked,
  looksLikeOom,
  sandboxErrorMessage,
} from "@/server/sandbox/errors";

describe("classifyContainerFailure", () => {
  it("OOMKilled 标记优先分类为 oom", () => {
    expect(classifyContainerFailure({ exitCode: 137, oomKilled: true })).toBe("oom");
  });

  it("stderr 含 OOM 特征且无标记时也分类为 oom", () => {
    expect(classifyContainerFailure({ exitCode: 1, stderr: "FATAL: out of memory" })).toBe("oom");
    expect(classifyContainerFailure({ exitCode: 1, stderr: "cannot allocate memory" })).toBe("oom");
  });

  it("网络被禁特征分类为 network-blocked", () => {
    expect(classifyContainerFailure({ exitCode: 42, stderr: "connect: Network is unreachable" })).toBe("network-blocked");
    expect(classifyContainerFailure({ exitCode: 42, stderr: "Error: fetch failed" })).toBe("network-blocked");
    expect(classifyContainerFailure({ exitCode: 42, stdout: "getaddrinfo ENOTFOUND example.com" })).toBe("network-blocked");
  });

  it("其余非零退出分类为 runtime-error", () => {
    expect(classifyContainerFailure({ exitCode: 7, stderr: "boom" })).toBe("runtime-error");
    expect(classifyContainerFailure({ exitCode: 137 })).toBe("runtime-error");
  });
});

describe("classifyDockerCommandFailure", () => {
  it("docker 守护进程不可达 → infra-unavailable", () => {
    expect(classifyDockerCommandFailure({ stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" })).toBe("infra-unavailable");
  });

  it("镜像缺失 → infra-unavailable（由消息说明镜像问题）", () => {
    expect(classifyDockerCommandFailure({ stderr: "Unable to find image 'node:24-bookworm-slim' locally" })).toBe("infra-unavailable");
  });

  it("CLI 超时 → timeout", () => {
    expect(classifyDockerCommandFailure({ timedOut: true })).toBe("timeout");
  });

  it("spawn ENOENT（docker 未安装）→ infra-unavailable", () => {
    expect(classifyDockerCommandFailure({ error: new Error("spawn docker ENOENT") })).toBe("infra-unavailable");
  });
});

describe("辅助判定", () => {
  it("looksLikeNetworkBlocked 识别常见网络错误", () => {
    for (const text of [
      "fetch failed",
      "getaddrinfo ENOTFOUND example.com",
      "Temporary failure in name resolution",
      "Could not resolve host: registry.npmjs.org",
      "Network is unreachable",
    ]) {
      expect(looksLikeNetworkBlocked(text), text).toBe(true);
    }
    expect(looksLikeNetworkBlocked("TypeError: x is not a function")).toBe(false);
  });

  it("looksLikeOom 识别 OOM 特征", () => {
    expect(looksLikeOom("out of memory")).toBe(true);
    expect(looksLikeOom("Cannot allocate memory")).toBe(true);
    expect(looksLikeOom("normal error")).toBe(false);
  });

  it("looksLikeInfraUnavailable 识别守护进程不可达", () => {
    expect(looksLikeInfraUnavailable("Is the docker daemon running?")).toBe(true);
    expect(looksLikeInfraUnavailable("permission denied while trying to connect to the Docker daemon socket")).toBe(true);
    expect(looksLikeInfraUnavailable("normal text")).toBe(false);
  });

  it("looksLikeImageMissing 识别镜像缺失", () => {
    expect(looksLikeImageMissing("Unable to find image 'x' locally")).toBe(true);
    expect(looksLikeImageMissing("pull access denied for x, repository does not exist")).toBe(true);
    expect(looksLikeImageMissing("normal text")).toBe(false);
  });
});

describe("sandboxErrorMessage", () => {
  it("五个分类都有可读中文消息", () => {
    expect(sandboxErrorMessage("timeout")).toContain("超时");
    expect(sandboxErrorMessage("oom")).toContain("OOM");
    expect(sandboxErrorMessage("network-blocked")).toContain("网络");
    expect(sandboxErrorMessage("runtime-error")).toContain("退出码");
    expect(sandboxErrorMessage("infra-unavailable")).toContain("沙箱不可用");
  });
});

describe("SandboxError", () => {
  it("携带结构化上下文", () => {
    const error = new SandboxError("timeout", "超时", { exitCode: null, stdout: "out", stderr: "err", durationMs: 100, cause: new Error("cause") });
    expect(error.code).toBe("timeout");
    expect(error.stdout).toBe("out");
    expect(error.stderr).toBe("err");
    expect(error.durationMs).toBe(100);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.name).toBe("SandboxError");
  });
});
