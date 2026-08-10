// 统一 API 响应与校验帮助。
import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { error: ReturnType<typeof fail> }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: fail("请求体不是合法 JSON", 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: fail("参数校验失败", 422, { issues: parsed.error.issues }) };
  }
  return { data: parsed.data };
}
