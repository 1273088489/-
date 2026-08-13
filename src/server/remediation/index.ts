// P2-06 个性化补课路径 —— 公共出口。
// 输入：errorHistory + 测试失败分类 + rubric 低分维度；
// 输出：remediation_path（目标 lesson/exercise/project、顺序、完成判定）。
export { mapSignalsToTargets, classifyErrorHistory, classifyTestFailures, classifyRubricLowScores } from "./mapper";
export type { MapperRule } from "./mapper";
export {
  buildRemediationPath,
  buildRuleExplanation,
  evaluateItemCompleted,
  REMEDIATION_SCORE_THRESHOLD,
  PROJECT_PASS_MASTERY,
  MAX_REMEDIATION_ITEMS,
} from "./builder";
export type { CompletionLookup } from "./builder";
export { enhancePathExplanation } from "./enhance";
export type { EnhancePathExplanationOptions } from "./enhance";
export {
  insertRemediationPath,
  getRemediationPathById,
  getRemediationPathForUser,
  findRemediationPathByAttempt,
  listRemediationPaths,
  markRemediationPathCompleted,
  remediationPathRecord,
  remediationItemUrl,
} from "./store";
export {
  getOrCreateRemediationPath,
  listUserRemediationPaths,
  listUserRemediationPathsForProject,
  getRemediationPathRecord,
  completeRemediationPath,
  buildCompletionLookup,
  REMEDIATION_MASTERY_BOOST,
  REMEDIATION_COMPLETED_MASTERY,
} from "./service";
export type { GetOrCreatePathResult, CompletePathResult } from "./service";
export type {
  RemediationSignal,
  RemediationSignalKind,
  LearningTargetRef as RemediationTargetRef,
  ErrorHistoryEntryInput,
  TestRunSignalInput,
  RubricLowDimensionInput,
  StoredRemediationItem,
  RemediationSource,
  BuildPathInput,
  BuiltRemediationPath,
  ContentCatalog,
} from "./types";
