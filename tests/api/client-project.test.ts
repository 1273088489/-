import { afterEach, describe, expect, it, vi } from "vitest";
import { apiProject } from "@/lib/client/api";

afterEach(() => vi.unstubAllGlobals());

describe("apiProject", () => {
  it("preserves the persisted teaching contract in the client projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              slug: "p1-static-page",
              title: "发布静态主页",
              description: "走通最小闭环",
              orderIndex: 0,
              tasks: [],
              acceptanceCriteria: [],
              guideMarkdown: "# 项目指南",
              deliverables: ["源码仓库", "发布地址"],
              rubric: [
                {
                  id: "implementation",
                  criterion: "实现与任务一致",
                  weight: 100,
                  evidence: ["源码"],
                  levels: { excellent: "完整", competent: "核心", developing: "尝试", missing: "无" },
                },
              ],
              reflectionQuestions: ["解释设计决策", "复盘失败"],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(apiProject("p1-static-page")).resolves.toMatchObject({
      guideMarkdown: "# 项目指南",
      deliverables: ["源码仓库", "发布地址"],
      rubric: [expect.objectContaining({ id: "implementation", weight: 100 })],
      reflectionQuestions: ["解释设计决策", "复盘失败"],
    });
  });
});
