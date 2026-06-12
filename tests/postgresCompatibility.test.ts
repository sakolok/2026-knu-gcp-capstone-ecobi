import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PostgreSQL compatibility", () => {
  it("keeps PostgreSQL migrations aligned with deployed column types", () => {
    const migration = readProjectFile("database/postgres_migrations/001_initial_schema.sql");

    expect(migration).not.toMatch(/CURRENT_(?:TIMESTAMP|DATE)::text/);
    expect(migration).not.toMatch(/\b(?:created_at|updated_at|deleted_at|selected_at|accepted_at|generated_at|requested_at|consumed_at)\s+TEXT\b/);
    expect(migration).not.toMatch(/\b(?:log_date|plan_window_start|plan_window_end|context_week_start|context_week_end)\s+TEXT\b/);
    expect(migration).not.toMatch(/\b(?:is_active|is_variable_amount|was_selected|was_feasible|was_accepted|counted_as_success)\s+INTEGER\b/);

    expect(migration).toContain("is_active BOOLEAN NOT NULL DEFAULT TRUE");
    expect(migration).toContain("was_selected BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration).toContain("plan_window_start DATE NOT NULL");
    expect(migration).toContain("log_date DATE NOT NULL DEFAULT CURRENT_DATE");
  });

  it("uses a PostgreSQL-safe date predicate for timestamp meal logs", () => {
    const repository = readProjectFile("server/repositories/mealRepository.ts");

    expect(repository).toContain('db.dialect === "postgres" ? "DATE(fl.consumed_at) = ?"');
    expect(repository).toContain('"substr(fl.consumed_at, 1, 10) = ?"');
  });
});
