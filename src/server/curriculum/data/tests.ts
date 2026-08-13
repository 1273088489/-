// P2-04 课程公开/隐藏测试定义（服务端专用）。
// 框架：static-check —— 在沙箱内以固定命令 node <script> 运行，脚本只读取学习者
// 仓库文件做启发式校验，绝不执行学习者代码；脚本以退出码 0/非 0 表达通过/失败。
// 隐藏测试内容只存在于本模块与 test_case 表（服务端），绝不进入公开 API/UI。
import type { ProjectTestCaseDef } from "@/server/tests/types";

const CHECK_HEADER = `import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel) {
  try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; }
}
function walkFiles(exts) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        const rel = path.relative(root, full);
        out.push({ rel, text: read(rel) });
      }
    }
  }
  walk(root);
  return out;
}
function allText(files) { return files.map((f) => f.text).join("\\n"); }
const failures = [];
function check(name, ok) {
  if (ok) console.log("PASS: " + name);
  else failures.push(name);
}
function finish() {
  if (failures.length > 0) {
    console.log("FAIL: " + failures.join(" | "));
    process.exit(1);
  }
  console.log("OK: 全部检查通过");
}
`;

function staticCheck(body: string): ProjectTestCaseDef["files"] {
  return { "check.mjs": `${CHECK_HEADER}\n${body}` };
}

export const PROJECT_TESTS: Record<string, { publicTests?: ProjectTestCaseDef[]; hiddenTests?: ProjectTestCaseDef[] }> = {
  // -------------------------------------------------------------------------
  // 项目 1：静态项目说明页
  // -------------------------------------------------------------------------
  "p1-static-page": {
    publicTests: [
      {
        id: "p1-public-page-content",
        name: "说明页包含名称、目标用户、核心流程与项目链接",
        framework: "static-check",
        files: staticCheck(`
const html = read("index.html") || read("public/index.html") || read("src/index.html");
check("存在 index.html", html.length > 0);
check("页面包含工单系统名称", /工单/.test(html));
check("页面包含目标用户", /用户/.test(html));
check("页面包含核心流程", /流程|步骤|创建|提交/.test(html));
check("页面包含 http(s) 项目链接", /https?:\\/\\/[^\\s"'<>]+/.test(html));
finish();
`),
      },
    ],
    hiddenTests: [
      {
        id: "p1-hidden-baseline-docs",
        name: "README 与最小 PRD 基线完整",
        framework: "static-check",
        files: staticCheck(`
const readme = read("README.md") || read("readme.md");
const prd = read("docs/ticket-prd.md");
check("存在 README", readme.length > 0);
check("README 含本地运行命令", /npm|npx|python|open index|serve|node/.test(readme));
check("README 含预期页面标题", /工单/.test(readme));
check("README 引用最小 PRD 路径", /docs\\/ticket-prd\\.md/.test(readme));
check("存在 docs/ticket-prd.md", prd.length > 0);
check("PRD 含标题", /标题|title/i.test(prd));
check("PRD 含用户与问题", /用户|问题|problem/i.test(prd));
check("PRD 含范围与验收标准", /范围|验收/i.test(prd));
check("PRD 含被放弃方案", /放弃|替代方案/i.test(prd));
finish();
`),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 项目 2：原生 JS 看板（priority 三档 + 旧数据迁移）
  // -------------------------------------------------------------------------
  "p2-vanilla-board": {
    publicTests: [
      {
        id: "p2-public-priority-ui",
        name: "优先级输入与展示存在（high/medium/low）",
        framework: "static-check",
        files: staticCheck(`
const html = read("index.html") || read("public/index.html") || read("src/index.html");
const js = allText(walkFiles([".js", ".mjs", ".ts"]));
check("存在 HTML 页面", html.length > 0);
check("页面提供优先级选项", /<select[\\s\\S]*?(high|medium|low)/i.test(html) || /priority/i.test(html));
check("源码含 high/medium/low", /high/i.test(js) && /medium/i.test(js) && /low/i.test(js));
check("使用 localStorage 持久化", /localStorage/i.test(js));
finish();
`),
      },
      {
        id: "p2-public-core-operations",
        name: "添加/完成/删除/筛选操作存在",
        framework: "static-check",
        files: staticCheck(`
const js = allText(walkFiles([".js", ".mjs", ".ts"]));
check("存在 JS 源码", js.length > 0);
check("支持添加工单", /add|push|create/i.test(js));
check("支持完成工单", /complete|done|toggle/i.test(js));
check("支持删除工单", /delete|remove/i.test(js));
check("支持状态筛选", /filter|status/i.test(js));
finish();
`),
      },
    ],
    hiddenTests: [
      {
        id: "p2-hidden-medium-fallback",
        name: "旧工单缺失 priority 时默认 medium",
        framework: "static-check",
        files: staticCheck(`
const js = allText(walkFiles([".js", ".mjs", ".ts"]));
check("源码含 priority 字段", /priority/i.test(js));
check("源码含 medium 默认值", /medium/i.test(js));
check("存在默认值回填写法", /\\?\\?|\\|\\||\\&\\&/.test(js) || /default|fallback|默认/i.test(js));
check("读取边界处理旧数据", /JSON\\.parse|localStorage/i.test(js));
finish();
`),
      },
      {
        id: "p2-hidden-migration-record",
        name: "影响分析与旧数据迁移说明存在",
        framework: "static-check",
        files: staticCheck(`
const docs = allText(walkFiles([".md"]));
const js = allText(walkFiles([".js", ".mjs", ".ts"]));
check("存在变更/影响分析文档", /影响分析|变更请求|priority|优先级/i.test(docs));
check("文档说明旧数据迁移", /迁移|旧数据|兼容/i.test(docs));
check("源码有迁移处理标记", /migrat|旧数据|兼容/i.test(js + docs));
finish();
`),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 项目 3：React 看板（组件边界 + 脚手架测试）
  // -------------------------------------------------------------------------
  "p3-react-board": {
    publicTests: [
      {
        id: "p3-public-component-boundary",
        name: "Task/Board 组件边界与 priority 贯通",
        framework: "static-check",
        files: staticCheck(`
const src = allText(walkFiles([".jsx", ".tsx", ".js", ".ts"]));
const pkg = read("package.json");
check("存在 React 源码", src.length > 0);
check("存在 Task 组件/类型", /Task/i.test(src));
check("存在 Board 组件", /Board/i.test(src));
check("源码含 priority 三档枚举", /high/i.test(src) && /medium/i.test(src) && /low/i.test(src));
check("状态由父组件持有", /useState/.test(src) || /props/.test(src));
finish();
`),
      },
      {
        id: "p3-public-test-script",
        name: "项目提供脚手架测试命令",
        framework: "static-check",
        files: staticCheck(`
const pkg = read("package.json");
let parsed = null;
try { parsed = JSON.parse(pkg); } catch { parsed = null; }
check("存在 package.json", pkg.length > 0);
check("定义 test 脚本", !!parsed && !!parsed.scripts && typeof parsed.scripts.test === "string" && parsed.scripts.test.trim().length > 0);
finish();
`),
      },
    ],
    hiddenTests: [
      {
        id: "p3-hidden-props-callbacks",
        name: "回调按 id 完成/删除且 ADR 记录组件边界",
        framework: "static-check",
        files: staticCheck(`
const src = allText(walkFiles([".jsx", ".tsx", ".js", ".ts"]));
const docs = allText(walkFiles([".md"]));
check("回调通过 props 传递", /props/.test(src) || /onComplete|onDelete|onRemove/.test(src));
check("回调使用工单 id", /on(?:Complete|Delete|Remove)[^\\n]{0,60}id/i.test(src) || /id[^\\n]{0,40}on(?:Complete|Delete|Remove)/i.test(src));
check("存在组件边界 ADR", /# ADR|状态：|背景：/.test(docs));
check("ADR 含决策与被放弃方案", /决策：/.test(docs) && /被放弃方案/.test(docs));
check("ADR 含后果", /后果/.test(docs));
finish();
`),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 项目 4：全栈工单系统（API + 权限 + 测试 + 部署）
  // -------------------------------------------------------------------------
  "p4-fullstack-board": {
    publicTests: [
      {
        id: "p4-public-api-contract",
        name: "API 契约与统一错误响应存在",
        framework: "static-check",
        files: staticCheck(`
const src = allText(walkFiles([".js", ".mjs", ".ts", ".tsx", ".jsx", ".yaml", ".yml", ".sql", ".md"]));
check("源码含 priority 字段", /priority/i.test(src));
check("契约含 high/medium/low 枚举", /high/i.test(src) && /medium/i.test(src) && /low/i.test(src));
check("存在 400 非法值处理", /400/.test(src));
check("存在 403 权限边界", /403/.test(src));
check("存在统一错误对象", /error/i.test(src));
finish();
`),
      },
      {
        id: "p4-public-test-evidence",
        name: "测试报告覆盖 CRUD/401/403 且退出码 0",
        framework: "static-check",
        files: staticCheck(`
const docs = allText(walkFiles([".md"]));
const pkg = read("package.json");
check("存在测试报告/README 说明", docs.length > 0 || pkg.length > 0);
check("报告含 CRUD 测试", /CRUD|create|update|delete/i.test(docs));
check("报告含 401 测试", /401/.test(docs));
check("报告含 403 测试", /403/.test(docs));
check("记录退出码 0", /退出码 0|exit code 0|exit 0/i.test(docs));
finish();
`),
      },
    ],
    hiddenTests: [
      {
        id: "p4-hidden-owner-boundary",
        name: "工单所有者权限边界（只能读写自己的工单）",
        framework: "static-check",
        files: staticCheck(`
const src = allText(walkFiles([".js", ".mjs", ".ts", ".tsx", ".jsx", ".sql", ".md"]));
check("源码含所有者概念", /owner|userId|user_id|auth/i.test(src));
check("存在 403 响应", /403/.test(src));
check("查询/更新绑定当前用户", /userId|user_id|owner/.test(src));
check("包含会话/认证处理", /session|token|auth|login/i.test(src));
finish();
`),
      },
      {
        id: "p4-hidden-deploy-record",
        name: "部署记录含 SHA、迁移、健康检查与回滚",
        framework: "static-check",
        files: staticCheck(`
const docs = allText(walkFiles([".md"]));
check("存在部署记录", /部署|deploy|release/i.test(docs));
check("记录不可变 SHA/版本", /sha|commit|镜像|image|版本/i.test(docs));
check("记录迁移结果", /迁移|migration/i.test(docs));
check("记录健康检查", /健康|health/i.test(docs));
check("记录回滚步骤", /回滚|rollback/i.test(docs));
finish();
`),
      },
    ],
  },
};
