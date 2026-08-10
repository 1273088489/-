import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// SQLite file lives in project root by default (gitignored). Env override for tests.
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "quanzhan.db");
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Minimal migration runner using browser-sqlite style SQL files (kept tiny).
// We let Drizzle handle schema via `drizzle-kit push`; this file only ensures
// the DB connection and a health check.
// ---------------------------------------------------------------------------

export function dbHealth() {
  const row = sqlite.prepare("SELECT 1 AS ok").get() as { ok: number };
  return row.ok === 1;
}
