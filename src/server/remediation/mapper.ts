// P2-06 规则引擎：错误类型 → 学习内容映射。
// 输入三路信号：
//  1) learning_record.errorHistory（关键字分类）
//  2) 测试失败分类（test_run + test_case，public 可引用测试名，hidden 只做泛化分类）
//  3) rubric 低分维度（review_feedback.rubricResults 中 missing/developing）
// 输出：RemediationSignal[]，每个信号携带目标学习内容（lesson/exercise/project slug + 理由）。
import type {
  ErrorHistoryEntryInput,
  LearningTargetRef,
  RemediationSignal,
  RubricLowDimensionInput,
  TestRunSignalInput,
} from "./types";

export interface MapperRule {
  id: string;
  /** 匹配归一化文本（错误历史条目 / 测试名 / rubric 维度名）。 */
  pattern: RegExp;
  label: string;
  targets: LearningTargetRef[];
}

/** 单个学习目标的快捷构造。 */
function ref(contentType: LearningTargetRef["contentType"], slug: string, reason: string): LearningTargetRef {
  return { contentType, slug, reason };
}

// ---------------------------------------------------------------------------
// 错误历史 → 学习内容（错误类型规则表）
// ---------------------------------------------------------------------------
export const ERROR_HISTORY_RULES: MapperRule[] = [
  {
    id: "security",
    pattern: /password|api[_-]?key|secret|密钥|xss|csrf|注入|泄露|token/i,
    label: "错误记录涉及安全敏感项（密码/密钥/令牌）",
    targets: [
      ref("lesson", "s4-auth-authorization", "错误记录涉及安全敏感项，先复习认证与授权课时"),
      ref("exercise", "s4-auth-ex1-session-flow", "通过会话流程练习巩固认证知识"),
      ref("exercise", "s4-auth-ex2-owner-guard", "通过对象级授权练习巩固权限控制"),
    ],
  },
  {
    id: "auth",
    pattern: /auth|登录|session|会话|密码|权限|授权/i,
    label: "错误记录涉及认证/会话/权限",
    targets: [
      ref("lesson", "s4-auth-authorization", "错误记录涉及认证与授权，先复习对应课时"),
      ref("exercise", "s4-auth-ex1-session-flow", "通过会话流程练习巩固认证知识"),
      ref("exercise", "s4-auth-ex2-owner-guard", "通过对象级授权练习巩固权限控制"),
    ],
  },
  {
    id: "testing",
    pattern: /test|测试|vitest|jest|assert|断言|coverage|\bci\b/i,
    label: "错误记录涉及测试/断言/CI",
    targets: [
      ref("lesson", "s4-testing-ci", "错误记录涉及测试，先复习测试策略课时"),
      ref("exercise", "s4-testing-ex1-test-plan", "通过测试计划练习明确验证目标"),
      ref("exercise", "s4-testing-ex2-ci-workflow", "通过 CI 工作流练习固化验证步骤"),
    ],
  },
  {
    id: "react",
    pattern: /react|component|组件|hook|usestate|props|jsx|状态提升/i,
    label: "错误记录涉及 React 组件/状态",
    targets: [
      ref("lesson", "s3-react", "错误记录涉及 React，先复习组件与状态课时"),
      ref("exercise", "s3-ex1-component", "通过组件拆分练习理解组件边界"),
      ref("exercise", "s3-ex2-state-up", "通过状态更新练习理解单向数据流"),
    ],
  },
  {
    id: "backend",
    pattern: /api|express|route|路由|接口|fetch|postgres|sql|数据库|query/i,
    label: "错误记录涉及后端/API/数据库",
    targets: [
      ref("lesson", "s4-node-postgres", "错误记录涉及后端/API，先复习 Node/Express 课时"),
      ref("exercise", "s4-ex1-api-shape", "通过 API 形状练习明确请求/响应结构"),
      ref("exercise", "s4-ex2-pg-vs-mongo", "通过数据库选型练习理解存储取舍"),
      ref("exercise", "s4-ex3-express-route", "通过路由练习巩固服务端分层"),
    ],
  },
  {
    id: "js-dom",
    pattern: /undefined|cannot read|null|render|dom|innerhtml|queryselector|事件|监听|看板/i,
    label: "错误记录涉及原生 JS/DOM 渲染",
    targets: [
      ref("lesson", "s2-vanilla-js", "错误记录涉及原生 JS，先复习看板实现课时"),
      ref("exercise", "s2-ex1-render", "通过渲染练习理解数据到视图的映射"),
      ref("exercise", "s2-ex2-persist", "通过持久化练习理解本地存储"),
    ],
  },
  {
    id: "deploy",
    pattern: /docker|deploy|部署|build|构建|container|端口|port|镜像|npm run build/i,
    label: "错误记录涉及构建/部署/容器",
    targets: [
      ref("lesson", "s4-docker-deployment", "错误记录涉及构建/部署，先复习 Docker 部署课时"),
      ref("exercise", "s4-deploy-ex1-dockerfile", "通过 Dockerfile 练习理解镜像构建"),
      ref("exercise", "s4-deploy-ex2-release-runbook", "通过发布手册练习固化部署步骤"),
    ],
  },
  {
    id: "git-env",
    pattern: /命令找不到|command not found|not recognized|git|路径|目录|PATH|环境/i,
    label: "错误记录涉及开发环境/Git/路径",
    targets: [
      ref("lesson", "s1-dev-environment", "错误记录涉及环境与 Git，先复习开发环境课时"),
      ref("exercise", "s1-ex1-git-commit", "通过 Git 提交练习掌握提交与历史"),
      ref("exercise", "s1-ex2-path", "通过路径诊断练习掌握命令定位"),
    ],
  },
];

// ---------------------------------------------------------------------------
// 测试失败 → 学习内容（按项目阶段映射）
// ---------------------------------------------------------------------------
/** 项目 slug → 该阶段最相关的课时（rubric 与测试失败的兜底目标）。 */
export const PROJECT_STAGE_LESSON: Record<string, string> = {
  "p1-static-page": "s1-dev-environment",
  "p2-vanilla-board": "s2-vanilla-js",
  "p3-react-board": "s3-react",
  "p4-fullstack-board": "s4-node-postgres",
};

/** 项目 slug → 测试失败推荐的学习内容（lesson/exercise/project）。 */
export const PROJECT_TEST_TARGETS: Record<string, Array<Omit<LearningTargetRef, "reason">>> = {
  "p1-static-page": [
    { contentType: "lesson", slug: "s1-dev-environment" },
    { contentType: "exercise", slug: "s1-ex1-git-commit" },
    { contentType: "exercise", slug: "s1-ex2-path" },
    { contentType: "project", slug: "p1-static-page" },
  ],
  "p2-vanilla-board": [
    { contentType: "lesson", slug: "s2-vanilla-js" },
    { contentType: "exercise", slug: "s2-ex1-render" },
    { contentType: "exercise", slug: "s2-ex2-persist" },
    { contentType: "project", slug: "p2-vanilla-board" },
  ],
  "p3-react-board": [
    { contentType: "lesson", slug: "s3-react" },
    { contentType: "exercise", slug: "s3-ex1-component" },
    { contentType: "exercise", slug: "s3-ex2-state-up" },
    { contentType: "project", slug: "p3-react-board" },
  ],
  "p4-fullstack-board": [
    { contentType: "lesson", slug: "s4-node-postgres" },
    { contentType: "exercise", slug: "s4-ex1-api-shape" },
    { contentType: "exercise", slug: "s4-ex3-express-route" },
    { contentType: "exercise", slug: "s4-testing-ex1-test-plan" },
    { contentType: "project", slug: "p4-fullstack-board" },
  ],
};

// ---------------------------------------------------------------------------
// rubric 低分维度 → 学习内容
// ---------------------------------------------------------------------------
/** rubric 维度 id → 低分推荐（lesson/exercise/project；project 目标由 builder 按当前项目补齐）。 */
export const RUBRIC_DIM_TARGETS: Record<string, Array<Omit<LearningTargetRef, "reason">>> = {
  implementation: [
    { contentType: "lesson", slug: "" }, // 由 builder 按项目阶段课时补齐
    { contentType: "project", slug: "" },
  ],
  verification: [
    { contentType: "lesson", slug: "s4-testing-ci" },
    { contentType: "exercise", slug: "s4-testing-ex1-test-plan" },
    { contentType: "project", slug: "" },
  ],
  "decision-record": [
    { contentType: "lesson", slug: "s1-dev-environment" },
    { contentType: "project", slug: "" },
  ],
};

const RUBRIC_LOW_LEVELS = new Set(["missing", "developing"]);

// ---------------------------------------------------------------------------
// 分类函数
// ---------------------------------------------------------------------------

/** 把 errorHistory 条目归一化为可匹配文本。 */
export function normalizeErrorEntry(entry: ErrorHistoryEntryInput): string {
  const parts: string[] = [];
  for (const value of Object.values(entry)) {
    if (typeof value === "string") parts.push(value);
    else if (typeof value === "number" || typeof value === "boolean") parts.push(String(value));
    else if (value !== null && typeof value === "object") {
      try {
        parts.push(JSON.stringify(value));
      } catch {
        /* 忽略不可序列化字段 */
      }
    }
  }
  return parts.join(" ").toLocaleLowerCase();
}

function matchRule(text: string, rules: MapperRule[]): MapperRule | null {
  const normalized = text.toLocaleLowerCase();
  return rules.find((rule) => rule.pattern.test(normalized)) ?? null;
}

/** 错误历史 → 信号（每条只取最具体的首个命中，避免噪声）。 */
export function classifyErrorHistory(entries: ErrorHistoryEntryInput[]): RemediationSignal[] {
  const signals: RemediationSignal[] = [];
  const seenRuleIds = new Set<string>();
  for (const entry of entries) {
    const text = normalizeErrorEntry(entry);
    if (!text.trim()) continue;
    const rule = matchRule(text, ERROR_HISTORY_RULES);
    if (!rule || seenRuleIds.has(rule.id)) continue;
    seenRuleIds.add(rule.id);
    signals.push({
      kind: "error-history",
      ruleId: rule.id,
      label: rule.label,
      targets: rule.targets,
    });
  }
  return signals;
}

/** 测试失败分类 → 信号。public 失败引用测试名；hidden 只做泛化分类，绝不暴露明细。 */
export function classifyTestFailures(
  testRuns: TestRunSignalInput[],
  projectSlug: string,
): RemediationSignal[] {
  const signals: RemediationSignal[] = [];
  const failed = testRuns.filter((run) => !run.passed && (run.status === "failed" || run.status === "error"));
  if (failed.length === 0) return signals;

  const projectTargets = PROJECT_TEST_TARGETS[projectSlug] ?? PROJECT_TEST_TARGETS["p1-static-page"];
  const stageLessonSlug = PROJECT_STAGE_LESSON[projectSlug] ?? PROJECT_STAGE_LESSON["p1-static-page"];

  const publicFailures = failed.filter((run) => run.kind === "public");
  const hiddenFailures = failed.filter((run) => run.kind === "hidden");

  // 公开测试失败：按具体测试归类（测试名对学习者可见）。
  for (const run of publicFailures.slice(0, 3)) {
    signals.push({
      kind: "test-failure",
      ruleId: `test-public-${run.key}`,
      label: `公开测试「${run.name}」未通过`,
      targets: projectTargets.map((target) => ({
        ...target,
        reason:
          target.contentType === "project"
            ? `修复测试「${run.name}」后重新提交项目`
            : `因公开测试「${run.name}」未通过而推荐`,
      })),
    });
  }

  // 隐藏测试失败：只泛化到阶段课时与项目重交，不引用测试名/内容。
  if (hiddenFailures.length > 0) {
    signals.push({
      kind: "test-failure",
      ruleId: "test-hidden",
      label: "隐藏验收用例未通过（服务端评估）",
      targets: [
        { contentType: "lesson", slug: stageLessonSlug, reason: "隐藏验收用例未通过，先复习该阶段课时" },
        { contentType: "project", slug: projectSlug, reason: "补齐验收要求后重新提交项目" },
      ],
    });
  }

  return signals;
}

/** rubric 低分维度 → 信号（level=missing/developing）。 */
export function classifyRubricLowScores(
  rubricResults: RubricLowDimensionInput[],
  projectSlug: string,
): RemediationSignal[] {
  const signals: RemediationSignal[] = [];
  const stageLessonSlug = PROJECT_STAGE_LESSON[projectSlug] ?? PROJECT_STAGE_LESSON["p1-static-page"];
  for (const item of rubricResults) {
    if (!RUBRIC_LOW_LEVELS.has(item.level)) continue;
    const baseTargets = RUBRIC_DIM_TARGETS[item.criterionId];
    if (!baseTargets) continue;
    const targets: LearningTargetRef[] = baseTargets.map((target) => {
      const slug = target.slug || (target.contentType === "lesson" ? stageLessonSlug : projectSlug);
      const reason =
        target.contentType === "project"
          ? `rubric「${item.criterion}」评分不足，按建议补齐后重新提交项目`
          : `因 rubric「${item.criterion}」评分不足而推荐`;
      return { ...target, slug, reason };
    });
    signals.push({
      kind: "rubric-low",
      ruleId: `rubric-${item.criterionId}`,
      label: `rubric「${item.criterion}」评分不足`,
      targets,
    });
  }
  return signals;
}

/** 汇总三路信号（错误历史 + 测试失败 + rubric 低分）。 */
export function mapSignalsToTargets(input: {
  errorHistory: ErrorHistoryEntryInput[];
  testRuns: TestRunSignalInput[];
  rubricResults: RubricLowDimensionInput[];
  projectSlug: string;
}): RemediationSignal[] {
  return [
    ...classifyErrorHistory(input.errorHistory),
    ...classifyTestFailures(input.testRuns, input.projectSlug),
    ...classifyRubricLowScores(input.rubricResults, input.projectSlug),
  ];
}
