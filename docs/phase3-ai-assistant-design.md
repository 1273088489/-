# AI 浮窗助手 — UI 设计规范

## 1. 浮窗按钮与聊天面板

- 按钮：56×56px，右下角固定定位（`fixed bottom-6 right-6`），z-50，圆角 `rounded-xl`，阴影 `shadow-lg`，背景 `bg-indigo-600`，悬停 `hover:bg-indigo-700`。图标使用 Lucide `MessageCircle` 或 `Bot`。展开/收起用 200ms ease-out 缩放过渡。
- 聊天面板：桌面端 380×560px（`w-[380px] h-[560px]`），`rounded-2xl`，`shadow-xl`，`border border-gray-200`，`bg-white`。`z-40`。面板入口动画：`transition-all duration-300` 配合 `scale-95→scale-100` 加 `opacity-0→100`。
- 拖拽把手：面板顶部 40px 区域（`cursor-grab active:cursor-grabbing`），位置存 localStorage 键 `qz_ai_pos`。

## 2. 消息气泡与输入区

- 用户气泡：`rounded-2xl rounded-br-sm`，`bg-indigo-600`，`text-white`，`px-4 py-2.5`，最大宽度 80%，`ml-auto`（右对齐）。
- AI 气泡：`rounded-2xl rounded-bl-sm`，`bg-gray-100`，`text-gray-800`，`px-4 py-2.5`，最大宽度 80%，`mr-auto`（左对齐），头像用 Lucide `Bot` 16px 图标置于气泡左上角。
- 输入区：面板底部固定，圆角 `rounded-xl`，`border border-gray-300`，`bg-white`，`px-4 py-3`。发送按钮 36×36px `rounded-lg bg-indigo-600 text-white`，Lucide `Send` 图标。`focus:ring-2 ring-indigo-500`。

## 3. 加载、错误与空状态

- 加载中：AI 气泡处显示三个跳动圆点（`animate-bounce`，延迟 0/150/300ms），圆点 6px `bg-gray-400 rounded-full`。
- 错误：AI 气泡内 `text-red-600` 错误消息 + `bg-red-50` 背景 + 重试按钮（`text-sm text-indigo-600 hover:underline`）。
- 空状态：面板首次打开时中间显示 `text-gray-400` 提示文字"你可以问我任何学习问题"，搭配 Lucide `Sparkles` 图标。

## 4. 移动端适配

- 屏幕宽度 < 640px 时：面板全屏覆盖（`fixed inset-0 rounded-none`），遮罩层 `bg-black/40 z-30`。按钮缩小至 `bottom-4 right-4`。
- 面板全屏时顶部显示 44px 标题栏（`text-sm font-semibold text-gray-900` + 左对齐关闭按钮 `rounded-full`）。
- 输入框在移动端自动 focus 唤起键盘，面板随键盘弹起滚动到底部（`scroll-behavior: smooth`）。

## 5. 可访问性

- 浮窗按钮 `aria-label="打开 AI 助手"`，面板 `role="dialog" aria-label="AI 助手"`。关闭按钮 `aria-label="关闭"`。
- 键盘：`Escape` 关闭面板，`Tab` 在消息列表与输入框间循环，`Enter` 发送（Shift+Enter 换行）。
- 对比度：所有文本颜色满足 WCAG AA（普通文本 ≥4.5:1，大文本 ≥3:1）。`bg-indigo-600` 上的白色文本 > 4.5:1。
- 动画遵循 `prefers-reduced-motion`，展开/收起用 `opacity` 代替 `scale`。
