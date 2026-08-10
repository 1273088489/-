import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/helpers/setup.ts"],
    include: ["./tests/**/*.test.ts"],
    exclude: ["./tests/e2e/**", "node_modules/**"],
    testTimeout: 30_000,
    // 每个测试文件跑在独立 worker，配合 DB_PATH 指向独立临时库，避免互相污染。
    fileParallelism: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
