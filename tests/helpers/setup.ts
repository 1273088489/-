// 测试用环境变量与全局清理。
// 统一在所有测试文件运行前把 DB_PATH 指向独立临时库，避免污染仓库根目录的 quanzhan.db。
// 单个测试文件的 worker 进程内 db/client.ts 默认只会在首次 import 时创建连接。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quanzhan-tests-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

// Vitest 退出时兜底清理临时目录。
function cleanup() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
}

process.on("exit", cleanup);
