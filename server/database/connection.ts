import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg, { type PoolConfig } from "pg";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1114, (value) => value.replace(" ", "T"));
types.setTypeParser(1700, (value) => Number(value));

type QueryParam = string | number | null | string[];

function toSqliteParams(params: QueryParam[]) {
  if (params.some(Array.isArray)) {
    throw new Error("SQLite queries do not support array parameters.");
  }
  return params as Array<string | number | null>;
}

export type DbRunResult = {
  changes: number;
  lastInsertRowid: number | null;
  rowCount: number;
};

export type DbDialect = "sqlite" | "postgres";

export type DbClient = {
  dialect: DbDialect;
  all<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]>;
  get<T = unknown>(sql: string, params?: QueryParam[]): Promise<T | undefined>;
  run(sql: string, params?: QueryParam[]): Promise<DbRunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(callback: (db: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

let db: DbClient | null = null;

export function getDatabaseDialect(): DbDialect {
  if (process.env.DB_CLIENT === "sqlite") return "sqlite";
  if (process.env.DB_CLIENT === "postgres" || process.env.DATABASE_URL) return "postgres";
  return "sqlite";
}

export function getDatabasePath() {
  return resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? "database/ecobi-dev.sqlite");
}

function toPostgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createSqliteClient(): DbClient {
  const databasePath = getDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const client: DbClient = {
    dialect: "sqlite",
    async all<T>(sql: string, params: QueryParam[] = []) {
      return sqlite.prepare(sql).all(...toSqliteParams(params)) as T[];
    },
    async get<T>(sql: string, params: QueryParam[] = []) {
      return sqlite.prepare(sql).get(...toSqliteParams(params)) as T | undefined;
    },
    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...toSqliteParams(params));
      return {
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
        rowCount: Number(result.changes),
      };
    },
    async exec(sql) {
      sqlite.exec(sql);
    },
    async transaction<T>(callback: (db: DbClient) => Promise<T>) {
      sqlite.exec("BEGIN");
      try {
        const result = await callback(client);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      sqlite.close();
    },
  };

  return client;
}

function getPostgresPoolConfig(): PoolConfig {
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  const max = Number(process.env.DB_POOL_MAX ?? 5);
  const connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000);

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
      max,
      connectionTimeoutMillis,
    };
  }

  if (!process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error("PostgreSQL을 사용하려면 DATABASE_URL 또는 DB_NAME/DB_USER 환경변수가 필요합니다.");
  }

  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl,
    max,
    connectionTimeoutMillis,
  };
}

function createPostgresClient(): DbClient {
  const pool = new Pool(getPostgresPoolConfig());

  const buildClient = (queryClient: pg.Pool | pg.PoolClient): DbClient => ({
    dialect: "postgres",
    async all<T>(sql: string, params: QueryParam[] = []) {
      const result = await queryClient.query(toPostgresSql(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: QueryParam[] = []) {
      const result = await queryClient.query(toPostgresSql(sql), params);
      return result.rows[0] as T | undefined;
    },
    async run(sql, params = []) {
      const result = await queryClient.query(toPostgresSql(sql), params);
      const firstRow = result.rows[0] as Record<string, unknown> | undefined;
      const firstValue = firstRow ? Object.values(firstRow)[0] : null;
      return {
        changes: result.rowCount ?? 0,
        lastInsertRowid: typeof firstValue === "number" ? firstValue : firstValue === null ? null : Number(firstValue),
        rowCount: result.rowCount ?? 0,
      };
    },
    async exec(sql) {
      await queryClient.query(sql);
    },
    async transaction<T>(callback: (db: DbClient) => Promise<T>) {
      const poolClient = await pool.connect();
      const txClient = buildClient(poolClient);
      try {
        await poolClient.query("BEGIN");
        const result = await callback(txClient);
        await poolClient.query("COMMIT");
        return result;
      } catch (error) {
        await poolClient.query("ROLLBACK");
        throw error;
      } finally {
        poolClient.release();
      }
    },
    async close() {
      await pool.end();
    },
  });

  return buildClient(pool);
}

export function getDb() {
  if (db) return db;
  db = getDatabaseDialect() === "postgres" ? createPostgresClient() : createSqliteClient();
  return db;
}

export function currentTimestampSql(client: Pick<DbClient, "dialect"> = getDb()) {
  return client.dialect === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP";
}

export async function closeDb() {
  if (!db) return;
  await db.close();
  db = null;
}
