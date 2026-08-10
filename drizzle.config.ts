import type { Config } from "drizzle-kit";
import path from "node:path";

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), "quanzhan.db");

export default {
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: dbPath },
} satisfies Config;
