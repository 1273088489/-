#!/usr/bin/env node
// Quanzhan 一键启动器：
// 自动检查依赖 -> 自动确保数据库 schema + seed -> 启动 dev/start。
// 用法: node scripts/quickstart.mjs [dev|start]
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const mode = process.argv[2] ?? "dev";

function run(cmd, args, opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} 失败 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r;
}

// 1) 依赖检查（node_modules/.bin/next 存在即视为已安装）
if (!fs.existsSync(path.join(root, "node_modules", ".bin", "next"))) {
  console.log("未检测到依赖，正在安装 (npm ci)…");
  run("npm", ["ci"], { stdio: "inherit" });
} else {
  console.log("✓ 依赖已就绪");
}

// 2) 数据库 schema 同步（drizzle-kit push 幂等）
console.log("\n[1/3] 数据库 schema 同步…");
run("npx", ["drizzle-kit", "push", "--force"]);

// 3) 课程 seed（幂等，可重复执行）
console.log("\n[2/3] 课程数据同步…");
run("node", ["--import", "tsx", "scripts/seed.ts"]);

// 4) 启动
console.log(`\n[3/3] 启动 ${mode === "start" ? "生产" : "开发"}模式…\n`);
const child = spawn("npm", ["run", mode], { stdio: "inherit", cwd: root });
child.on("error", (e) => { console.error("启动失败:", e); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 0));
