// P2-03/P2-07 沙箱执行 —— 公共出口。
export { runProjectInSandbox, buildPhaseScript, parsePhaseResults, stripPhaseMarkers, shellQuote } from "./orchestrator";
export type { RunProjectInSandboxOptions } from "./orchestrator";
export {
  planPhases,
  readPackageJson,
  hasPackageJsonFile,
  hasProjectManifest,
  hasPythonManifest,
  hasPythonTestStructure,
  detectProjectStructure,
  planPythonPhases,
  STATIC_VERIFY_CMD,
} from "./adapters";
export type { AdapterPlan, ProjectStructure } from "./adapters";
export {
  NPM_OFFLINE_CACHE_ENV,
  NPM_OFFLINE_CACHE_CONTAINER_PATH,
  resolveNpmOfflineCache,
  offlineCacheUsable,
  npmOfflineFlags,
  npmOfflineEnv,
  applyNpmOfflineToInstallPhase,
} from "./offline-cache";
export type { NpmOfflineCache } from "./offline-cache";
export {
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_PYTHON_SANDBOX_IMAGE,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_MEMORY_MB,
  parseProjectSandboxConfig,
  resolveProjectSandboxConfig,
} from "./config";
export type {
  SandboxRuntime,
  SandboxPhaseId,
  ProjectSandboxConfig,
  SandboxPhase,
  SandboxPhaseResult,
  SandboxProjectRunResult,
} from "./types";
