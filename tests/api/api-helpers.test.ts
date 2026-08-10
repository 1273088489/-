// api-helpers.test.ts —— 验证统一 API 响应结构 ok()/fail()。
// src/lib/api.ts 只依赖 next/server（无 server-only），在 node 环境下可直接 import 测试。
import { describe, expect, it } from "vitest";
import { ok, fail, parseBody } from "@/lib/api";
import { z } from "zod";

describe("ok()", () => {
  it("返回 ok:true 与 200", async () => {
    const res = ok({ id: "c1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ id: "c1" });
  });

  it("接受 ResponseInit 覆盖状态码与响应头", async () => {
    const res = ok({ n: 1 }, { status: 201, headers: { "x-test": "yes" } });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-test")).toBe("yes");
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("fail()", () => {
  it("默认 400 且返回 ok:false 与 error 文本", async () => {
    const res = fail("参数错误");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("参数错误");
  });

  it("支持自定义 status 与额外字段", async () => {
    const res = fail("校验失败", 422, { issues: [{ path: ["title"], message: "必填" }] });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("校验失败");
    expect(body.issues).toHaveLength(1);
  });
});

describe("parseBody()", () => {
  const schema = z.object({ title: z.string() });

  it("合法 JSON 通过校验并返回 data", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ title: "hello" }),
      headers: { "content-type": "application/json" },
    });
    const out = await parseBody(req, schema);
    expect("data" in out).toBe(true);
    if ("data" in out) expect(out.data).toEqual({ title: "hello" });
  });

  it("非法 JSON 返回统一错误响应", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const out = await parseBody(req, schema);
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect((out.error as Response).status).toBe(400);
      const body = await (out.error as Response).json();
      expect(body.error).toBe("请求体不是合法 JSON");
    }
  });

  it("schema 校验失败返回 422 与 issues", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const out = await parseBody(req, schema);
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect((out.error as Response).status).toBe(422);
      const body = await (out.error as Response).json();
      expect(body.issues).toBeDefined();
    }
  });
});
