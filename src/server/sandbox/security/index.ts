// P2-07 沙箱安全审计 —— 公共出口。
export {
  auditFilePath,
  auditPaths,
  auditShellArg,
  auditContainerArg,
  auditEscapePayloads,
  looksLikeCommandInjection,
  SHELL_UNSAFE_PATTERN,
  ESCAPE_PAYLOADS,
} from "./audit";
export type { SanitizationAudit } from "./audit";
