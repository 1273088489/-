// 课程内容类型定义。课程在 curriculum/data/*.ts 中定义，经由 curriculum/service.ts 加载入库。
import type { ProjectRubricCriterion } from "@/types";
import type { ProjectSandboxConfig } from "@/server/runner/types";
import type { ProjectTestCaseDef } from "@/server/tests/types";

export type { ProjectRubricCriterion } from "@/types";
export type { ProjectSandboxConfig } from "@/server/runner/types";
export type { ProjectTestCaseDef } from "@/server/tests/types";

export interface ExerciseDef {
  slug: string;
  prompt: string;
  hints: string[];
  solution: string;
  rubric: string[];
  answerType: "choices" | "code" | "text";
  choices?: string[];
  correctChoiceIndex?: number;
}

export interface LessonDef {
  slug: string;
  title: string;
  orderIndex: number;
  contentMarkdown: string;
  requiresPass: boolean;
  exercises: ExerciseDef[];
}

export interface StageProjectDef {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  tasks: string[];
  acceptanceCriteria: string[];
  guideMarkdown: string;
  deliverables: string[];
  rubric: ProjectRubricCriterion[];
  reflectionQuestions: string[];
  /** 项目级沙箱执行配置（P2-03）；缺省按仓库结构自动检测。 */
  sandbox?: ProjectSandboxConfig;
  /** 公开测试（P2-04）：项目定义、学习者可见，沙箱内执行。 */
  publicTests?: ProjectTestCaseDef[];
  /** 隐藏测试（P2-04）：服务端专用，评估时注入沙箱，绝不在课程数据/API/UI 暴露。 */
  hiddenTests?: ProjectTestCaseDef[];
}

export interface CourseDef {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  lessons: LessonDef[];
  projects: StageProjectDef[];
}
