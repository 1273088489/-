import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "../helpers/ddl";

export const e2eDatabasePath = path.resolve(import.meta.dirname, "../../test-results/e2e/quanzhan.db");

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(path.dirname(e2eDatabasePath), { recursive: true });
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${e2eDatabasePath}${suffix}`, { force: true });
  }

  const database = new Database(e2eDatabasePath);
  applyMigrations(database);
  database.close();

  process.env.DB_PATH = e2eDatabasePath;
  const { seedCurriculum } = await import("@/server/curriculum/service");
  await seedCurriculum();
  const { sqlite } = await import("@/server/db/client");
  sqlite.close();
}
