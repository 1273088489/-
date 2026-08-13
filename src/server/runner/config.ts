// P2-03/P2-07 沙箱配置解析与默认值。
// 配置来源是课程数据（stage_project.sandbox_config，可信），不是学习者仓库；
// 学习者仓库只决定“是否有 build/test script / 是否有依赖清单”，不会注入任意配置。
import { z } from "zod";
import type { ProjectSandboxConfig, SandboxRuntime } from "./types";

/** 沙箱镜像，可用 SANDBOX_IMAGE 覆盖（例如指向本地已存在的 node 镜像）。 */
export const DEFAULT_SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "node:24-bookworm-slim";

/** Python 运行时的默认镜像；可用 SANDBOX_PYTHON_IMAGE 覆盖。 */
export const DEFAULT_PYTHON_SANDBOX_IMAGE = process.env.SANDBOX_PYTHON_IMAGE ?? "python:3.12-slim";

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 600_000;
export const DEFAULT_MEMORY_MB = 512;
export const MIN_MEMORY_MB = 64;
export const MAX_MEMORY_MB = 2048;

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const sandboxConfigSchema = z
  .object({
    runtime: z.enum(["node", "python", "static"]).optional(),
    image: z.string().trim().min(1).optional(),
    install: z.array(z.string().min(1)).nullable().optional(),
    build: z.array(z.string().min(1)).nullable().optional(),
    test: z.array(z.string().min(1)).nullable().optional(),
    run: z.array(z.string().min(1)).nullable().optional(),
    timeoutMs: z.number().int().min(1_000).max(MAX_TIMEOUT_MS).optional(),
    memoryMb: z.number().int().min(MIN_MEMORY_MB).max(MAX_MEMORY_MB).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .superRefine((config, context) => {
    for (const [key, value] of Object.entries(config.env ?? {})) {
      if (!ENV_KEY_PATTERN.test(key)) {
        context.addIssue({ code: "custom", message: `环境变量名不合法：${key}`, path: ["env", key] });
      }
      if (value.includes("\0") || value.includes("\n")) {
        context.addIssue({ code: "custom", message: `环境变量 ${key} 的值必须是单行字符串`, path: ["env", key] });
      }
    }
  });

/** 解析并校验课程数据里的 sandbox 配置；非法配置返回 null（调用方按默认值处理）。 */
export function parseProjectSandboxConfig(raw: unknown): ProjectSandboxConfig | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return null;
  const parsed = sandboxConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 把（可能为空的）配置合并到默认值，得到可执行的完整配置。 */
export function resolveProjectSandboxConfig(raw: unknown): ProjectSandboxConfig {
  const config = parseProjectSandboxConfig(raw);
  return {
    runtime: config?.runtime,
    image: config?.image,
    install: config?.install,
    build: config?.build,
    test: config?.test,
    run: config?.run,
    timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    memoryMb: config?.memoryMb ?? DEFAULT_MEMORY_MB,
    env: config?.env ?? {},
  };
}

/**
 * 配置缺省运行时：无 sandbox 配置时按仓库结构自动检测。
 * - package.json → node（有完整 Node 工具链的镜像）
 * - 否则存在 requirements.txt / requirements-dev.txt / pyproject.toml / setup.py / setup.cfg / pytest.ini / tox.ini → python
 * - 其余 → static
 * monorepo 分层探测由 adapters.detectProjectStructure 负责；此函数只做根级缺省。
 */
export function defaultRuntimeForProject(files: { hasPackageJson: boolean; hasPythonManifest: boolean }): SandboxRuntime {
  if (files.hasPackageJson) return "node";
  if (files.hasPythonManifest) return "python";
  return "static";
}
