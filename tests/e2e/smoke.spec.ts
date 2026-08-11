import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string): Promise<void> {
  await page.goto("/login?mode=register");
  await page.getByLabel("昵称").fill("测试学习者");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill("test-pass-2026");
  await page.getByLabel("确认密码").fill("test-pass-2026");
  const registration = page.waitForResponse(
    (response) => response.url().includes("/api/auth/register") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "创建账号" }).click();
  expect((await registration).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "学习仪表盘" })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出" })).toBeVisible();
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
  const [, courseResponse] = await Promise.all([
    page.waitForURL(/\/course\/fullstack-ticket-system$/, { timeout: 30_000 }),
    page.waitForResponse(
      (response) => response.url().includes("/api/course/fullstack-ticket-system") && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
    courseLink.click(),
  ]);
  expect(courseResponse.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "全栈工单管理系统（从零到上线）" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "课时列表" })).toBeVisible();
});

test("学习者可以从课时要求进入真实练习证据路径", async ({ page }) => {
  await register(page, `lesson-${Date.now()}@example.com`);
  const [, courseResponse] = await Promise.all([
    page.goto("/course/fullstack-ticket-system"),
    page.waitForResponse(
      (response) => response.url().includes("/api/course/fullstack-ticket-system") && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
  ]);
  expect(courseResponse.ok()).toBe(true);

  const lessonLink = page.locator('a[href="/lesson/s1-dev-environment"]');
  await expect(lessonLink).toBeVisible();
  const [, lessonResponse] = await Promise.all([
    page.waitForURL(/\/lesson\/s1-dev-environment$/, { timeout: 30_000 }),
    page.waitForResponse(
      (response) => response.url().includes("/api/lesson/s1-dev-environment") && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
    lessonLink.click(),
  ]);
  expect(lessonResponse.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "学习目标" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "前置条件" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本阶段交付物" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本节练习" })).toBeVisible();

  const exerciseLink = page.locator('a[href^="/exercise/"]').first();
  await expect(exerciseLink).toBeVisible();
  const [, exerciseResponse] = await Promise.all([
    page.waitForURL(/\/exercise\//, { timeout: 30_000 }),
    page.waitForResponse(
      (response) => response.url().includes("/api/exercise/") && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
    exerciseLink.click(),
  ]);
  expect(exerciseResponse.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("提交一次基线提交的证据");
  await expect(page.getByRole("heading", { name: "提交前标准" })).toBeVisible();
});

test("练习在提交前展示 rubric 与形成性评审边界", async ({ page }) => {
  await register(page, `exercise-${Date.now()}@example.com`);
  const lessonResponse = await page.request.get("/api/lesson/s1-dev-environment");
  expect(lessonResponse.ok()).toBe(true);
  const lessonBody = await lessonResponse.json();
  const exerciseId = lessonBody.data.exercises[0]?.id as string | undefined;
  expect(exerciseId).toBeTruthy();

  const [, exerciseResponse] = await Promise.all([
    page.goto(`/exercise/${exerciseId}`),
    page.waitForResponse(
      (response) => response.url().endsWith(`/api/exercise/${exerciseId}`) && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
  ]);
  expect(exerciseResponse.ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "提交前标准" })).toBeVisible();
  await expect(page.locator("main")).toContainText("形成性启发式");
  await expect(page.locator("main")).toContainText("系统未运行代码，也没有隐藏测试");
  await expect(page.getByRole("button", { name: "提交答案" })).toBeDisabled();
});

test("阶段项目在提交前展示完整教学合同", async ({ page }) => {
  await register(page, `project-${Date.now()}@example.com`);
  const courseResponse = await page.request.get("/api/course/fullstack-ticket-system");
  expect(courseResponse.ok()).toBe(true);
  const courseBody = await courseResponse.json();
  const projectSlug = courseBody.data.projects[0]?.slug as string | undefined;
  expect(projectSlug).toBeTruthy();

  const [, projectResponse] = await Promise.all([
    page.goto(`/project/${projectSlug}`),
    page.waitForResponse(
      (response) => response.url().endsWith(`/api/project/${projectSlug}`) && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
  ]);
  expect(projectResponse.ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "项目指南" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "交付物" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "验收标准" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "评分 Rubric" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "复盘问题" })).toBeVisible();
  await expect(page.locator("main")).toContainText("优秀");
  await expect(page.locator("main")).toContainText("缺失");
});

test("不存在的课程显示明确错误而不展示演示内容", async ({ page }) => {
  await register(page, `missing-${Date.now()}@example.com`);
  const [, courseResponse] = await Promise.all([
    page.goto("/course/not-a-course"),
    page.waitForResponse(
      (response) => response.url().endsWith("/api/course/not-a-course") && response.request().method() === "GET",
      { timeout: 30_000 },
    ),
  ]);

  expect(courseResponse.status()).toBe(404);
  await expect(page.getByText("课程不存在", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(page.getByText("当前展示演示数据", { exact: false })).toHaveCount(0);
});
