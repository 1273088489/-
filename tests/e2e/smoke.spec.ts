import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string): Promise<void> {
  await page.goto("/login?mode=register");
  await page.getByLabel("昵称").fill("测试学习者");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill("test-pass-2026");
  await page.getByLabel("确认密码").fill("test-pass-2026");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "学习仪表盘" })).toBeVisible();
}

test("首页展示产品与课程入口", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Quanzhan/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "课程概览" })).toBeVisible();
  await expect(page.getByRole("link", { name: "登录 / 注册" })).toBeVisible();
});

test("学习者可以注册、退出会话后再登录", async ({ page }) => {
  const email = `learner-${Date.now()}@example.com`;
  await register(page, email);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("test-pass-2026");
  await page.locator("form").getByRole("button", { name: "登录", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "学习仪表盘" })).toBeVisible();
});

test("已登录学习者可以从首页进入课程", async ({ page }) => {
  await register(page, `course-${Date.now()}@example.com`);
  await page.goto("/");
  const courseLink = page.locator('a[href="/course/fullstack-ticket-system"]').last();
  await expect(courseLink).toBeVisible();
  await courseLink.click();

  await expect(page).toHaveURL(/\/course\/fullstack-ticket-system$/);
  await expect(page.getByRole("heading", { name: "全栈工单管理系统" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "课时列表" })).toBeVisible();
});
