import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../helpers/ddl";

afterEach(() => {
  vi.doUnmock("@/server/auth/session");
  vi.resetModules();
});

describe("GET /api/project/[slug]", () => {
  it("returns the persisted stage project teaching contract", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-project-api-test-"));
    const databasePath = path.join(temporaryDirectory, "api.db");
    const previousDatabasePath = process.env.DB_PATH;
    const migrationDatabase = new Database(databasePath);
    applyMigrations(migrationDatabase);
    migrationDatabase.close();
    process.env.DB_PATH = databasePath;
    vi.resetModules();
    vi.doMock("@/server/auth/session", () => ({
      getSessionUser: vi.fn().mockResolvedValue({ id: "learner-1" }),
    }));

    let sqlite: Database.Database | undefined;
    try {
      const { db, seedCurriculum } = await import("@/server/curriculum/service");
      const { stageProjects } = await import("@/server/db/schema");
      ({ sqlite } = await import("@/server/db/client"));
      await seedCurriculum();
      const { GET } = await import("@/app/api/project/[slug]/route");

      const response = await GET(new NextRequest("http://localhost/api/project/p1-static-page"), {
        params: Promise.resolve({ slug: "p1-static-page" }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        data: {
          slug: "p1-static-page",
          guideMarkdown: expect.stringContaining("# 项目指南"),
          deliverables: ["静态项目说明页源码仓库", "最小 PRD 与需求基线", "包含本地运行说明的 README", "发布地址与提交记录"],
          rubric: expect.arrayContaining([
            expect.objectContaining({ id: "implementation", weight: 40 }),
            expect.objectContaining({ id: "verification", weight: 35 }),
            expect.objectContaining({ id: "decision-record", weight: 25 }),
          ]),
          reflectionQuestions: expect.arrayContaining([expect.stringContaining("设计决策")]),
        },
      });
      expect(JSON.stringify(body)).not.toContain("solution");

      for (const expected of [
        {
          slug: "p2-vanilla-board",
          guideMarker: "## 需求变更与影响分析模板",
          deliverable: "旧 localStorage 数据迁移验证记录",
        },
        {
          slug: "p3-react-board",
          guideMarker: "## ADR 模板",
          deliverable: "脚手架测试报告",
        },
      ]) {
        const projectResponse = await GET(new NextRequest("http://localhost/api/project/" + expected.slug), {
          params: Promise.resolve({ slug: expected.slug }),
        });
        const projectBody = await projectResponse.json();

        expect(projectResponse.status).toBe(200);
        expect(projectBody.data.guideMarkdown).toContain(expected.guideMarker);
        expect(projectBody.data.deliverables).toContain(expected.deliverable);
        expect(projectBody.data.rubric.reduce(
          (total: number, criterion: { weight: number }) => total + criterion.weight,
          0,
        )).toBe(100);
        expect(JSON.stringify(projectBody)).not.toContain("solution");
      }

      const finalResponse = await GET(new NextRequest("http://localhost/api/project/p4-fullstack-board"), {
        params: Promise.resolve({ slug: "p4-fullstack-board" }),
      });
      const finalBody = await finalResponse.json();

      expect(finalResponse.status).toBe(200);
      expect(finalBody.data).toMatchObject({
        guideMarkdown: expect.stringContaining("## OpenAPI 风格 API 契约模板"),
        deliverables: expect.arrayContaining([
          "PRD 定稿与优先级影响分析",
          "Mermaid ER 图",
          "OpenAPI 风格 API 契约",
          "架构决策记录 ADR",
          "测试报告",
          "部署与回滚记录",
        ]),
        reflectionQuestions: expect.arrayContaining([expect.stringMatching(/失败|迁移/)]),
      });
      expect(finalBody.data.rubric.reduce((total: number, criterion: { weight: number }) => total + criterion.weight, 0)).toBe(100);
      expect(JSON.stringify(finalBody)).not.toContain("solution");

      db.update(stageProjects)
        .set({
          deliverables: "{",
          rubric: JSON.stringify([
            {
              id: "duplicate",
              criterion: "实现",
              weight: 40,
              evidence: ["源码"],
              levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" },
            },
            {
              id: "duplicate",
              criterion: "验证",
              weight: 35,
              evidence: ["报告"],
              levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" },
            },
            {
              id: "decision",
              criterion: "取舍",
              weight: 24,
              evidence: ["README"],
              levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" },
            },
          ]),
          reflectionQuestions: "{}",
        })
        .where(eq(stageProjects.slug, "p1-static-page"))
        .run();
      const malformedResponse = await GET(new NextRequest("http://localhost/api/project/p1-static-page"), {
        params: Promise.resolve({ slug: "p1-static-page" }),
      });

      expect((await malformedResponse.json()).data).toMatchObject({
        deliverables: [],
        rubric: [],
        reflectionQuestions: [],
      });
    } finally {
      if (sqlite?.open) sqlite.close();
      if (previousDatabasePath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDatabasePath;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
