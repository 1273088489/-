import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const defaultMigrationsDirectory = path.resolve(import.meta.dirname, "../../drizzle");

/** Apply the repository's generated SQL migrations without relying on Drizzle internals. */
export function applyMigrations(
  database: Database.Database,
  migrationsDirectory = defaultMigrationsDirectory,
): void {
  const migrationFiles = fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
  }

  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    for (const migrationFile of migrationFiles) {
      const migration = fs.readFileSync(path.join(migrationsDirectory, migrationFile), "utf8");
      database.exec(migration);
    }
  })();
}
