import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getDatabaseDialect, getDb } from "./connection.js";

function getMigrationsDir() {
  const directory = getDatabaseDialect() === "postgres" ? "database/postgres_migrations" : "database/migrations";
  return resolve(process.cwd(), directory);
}

export async function runMigrations() {
  const db = getDb();
  const appliedAtType = db.dialect === "postgres" ? "TIMESTAMP" : "TEXT";
  const appliedAtDefault = "CURRENT_TIMESTAMP";
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at ${appliedAtType} NOT NULL DEFAULT ${appliedAtDefault}
    );
  `);

  const appliedRows = await db.all<{ version: string }>("SELECT version FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.version));

  const migrationFiles = readdirSync(getMigrationsDir())
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(getMigrationsDir(), file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.run("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
    });
  }
}
