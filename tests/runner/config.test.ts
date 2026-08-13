// P2-03 沙箱配置解析：默认值、校验与容错。
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_MB,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  parseProjectSandboxConfig,
  resolveProjectSandboxConfig,
} from "@/server/runner/config";

describe("parseProjectSandboxConfig", () => {
  it("解析合法配置并保留显式字段", () => {
    const config = parseProjectSandboxConfig({
      runtime: "node",
      install: ["npm", "ci"],
      build: null,
      test: ["npm", "test"],
      timeoutMs: 30_000,
      memoryMb: 256,
      env: { NODE_ENV: "test" },
    });
    expect(config).toMatchObject({
      runtime: "node",
      install: ["npm", "ci"],
      build: null,
      test: ["npm", "test"],
      timeoutMs: 30_000,
      memoryMb: 256,
      env: { NODE_ENV: "test" },
    });
  });

  it("拒绝非法配置（未知字段 / 非法 env 键 / 超限超时）", () => {
    expect(parseProjectSandboxConfig({ runtime: "python" })).toEqual({ runtime: "python" });
    expect(parseProjectSandboxConfig({ timeoutMs: MAX_TIMEOUT_MS + 1 })).toBeNull();
    expect(parseProjectSandboxConfig({ env: { "BAD KEY": "1" } })).toBeNull();
    expect(parseProjectSandboxConfig({ env: { OK: "line\nbreak" } })).toBeNull();
    expect(parseProjectSandboxConfig({ runtime: "python", unexpected: true })).toBeNull();
    expect(parseProjectSandboxConfig("node")).toBeNull();
  });

  it("resolveProjectSandboxConfig 填充默认值并保留显式 runtime", () => {
    const resolved = resolveProjectSandboxConfig({ runtime: "static" });
    expect(resolved).toMatchObject({ runtime: "static", timeoutMs: DEFAULT_TIMEOUT_MS, memoryMb: DEFAULT_MEMORY_MB, env: {} });

    const auto = resolveProjectSandboxConfig(undefined);
    expect(auto.runtime).toBeUndefined();
    expect(auto.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(auto.memoryMb).toBe(DEFAULT_MEMORY_MB);
  });
});
