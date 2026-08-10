import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/server/curriculum/service";
import { users } from "@/server/db/schema";
import { hashPassword, createSession, setSessionCookie } from "@/server/auth/session";
import { ok, fail, parseBody } from "@/lib/api";

// 注册参数校验：邮箱、昵称、密码。
const registerSchema = z.object({
  email: z.string().trim().email("邮箱格式不正确"),
  name: z.string().trim().min(1, "昵称不能为空").max(50, "昵称过长"),
  password: z.string().min(6, "密码至少 6 位").max(128, "密码过长"),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 解析并校验请求体
  const parsed = await parseBody(req, registerSchema);
  if ("error" in parsed) return parsed.error;

  const { email, name, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // 判断邮箱是否已被注册
  const existing = db.select().from(users).where(eq(users.email, normalizedEmail)).get();
  if (existing) {
    return fail("该邮箱已注册", 409);
  }

  // 创建用户并建立会话
  const passwordHash = hashPassword(password);
  const user = db
    .insert(users)
    .values({ email: normalizedEmail, name, passwordHash })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .get();

  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return ok({ ...session, user }, { status: 201 });
}
