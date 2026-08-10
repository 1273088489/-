import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/server/curriculum/service";
import { users } from "@/server/db/schema";
import { verifyPassword, createSession, setSessionCookie } from "@/server/auth/session";
import { ok, fail, parseBody } from "@/lib/api";

// 登录参数校验
const loginSchema = z.object({
  email: z.string().trim().email("邮箱格式不正确"),
  password: z.string().min(1, "密码不能为空"),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginSchema);
  if ("error" in parsed) return parsed.error;

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // 查找用户并校验密码
  const user = db.select().from(users).where(eq(users.email, normalizedEmail)).get();
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail("邮箱或密码错误", 401);
  }

  // 建立会话并写入 cookie
  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return ok({
    ...session,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
}
