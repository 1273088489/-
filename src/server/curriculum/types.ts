// 课程内容类型定义。课程在 curriculum/data/*.ts 中定义，经由 curriculum/service.ts 加载入库。
import type { ProjectRubricCriterion } from "@/types";

export type { ProjectRubricCriterion } from "@/types";

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
}

export interface CourseDef {
  slug: string;
  title: string;
  description: string;
  orderIndex: number;
  lessons: LessonDef[];
  projects: StageProjectDef[];
}
