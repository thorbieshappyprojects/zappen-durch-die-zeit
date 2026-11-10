import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Db;
  /** "postgres" when DATABASE_URL is set, otherwise embedded PGlite. */
  driver: "postgres" | "pglite";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export interface DbOptions {
  /** Postgres connection string. Defaults to DATABASE_URL. */
  url?: string;
  /** PGlite data directory, or "memory://" for tests. Defaults to ZDZ_PGLITE_DIR or <repo>/.data/pglite. */
  dataDir?: string;
}

/** Repository root: the nearest directory upwards that contains pnpm-workspace.yaml. */
export function repoRoot(from = process.cwd()): string {
  // Runtime-only lookup: keep bundlers from tracing the whole project.
  let dir = path.resolve(/* turbopackIgnore: true */ from);
  while (!existsSync(path.join(/* turbopackIgnore: true */ dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
  return dir;
}

/** MIGRATIONS_DIR for a built image; in the repository packages/db/drizzle. */
const migrationsFolder = () => process.env.MIGRATIONS_DIR || path.join(repoRoot(), "packages/db/drizzle");

/**
 * Opens the database. Local development uses PGlite (Postgres in WASM, stored
 * in a folder) so no server is needed; set DATABASE_URL for a real Postgres.
 */
export async function createDb(options: DbOptions = {}): Promise<DbHandle> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 5 });
    const db = drizzlePostgres(client, { schema });
    return {
      db: db as unknown as Db,
      driver: "postgres",
      migrate: () => migratePostgres(db, { migrationsFolder: migrationsFolder() }),
      close: () => client.end(),
    };
  }

  // Production never falls back to PGlite (an empty local database would look like data loss);
  // a local production test names the folder explicitly with ZDZ_PGLITE_DIR.
  if (process.env.NODE_ENV === "production" && !options.dataDir && !process.env.ZDZ_PGLITE_DIR)
    throw new Error("DATABASE_URL is not set: production runs only on PostgreSQL.");
  const dataDir = options.dataDir ?? process.env.ZDZ_PGLITE_DIR ?? path.join(repoRoot(), ".data/pglite");
  const inMemory = dataDir.startsWith("memory://");
  const releaseLock = inMemory ? () => {} : acquireLock(dataDir);
  try {
    const client = await PGlite.create(dataDir, { extensions: { pg_trgm } });
    const db = drizzlePglite(client, { schema });
    return {
      db: db as unknown as Db,
      driver: "pglite",
      migrate: () => migratePglite(db, { migrationsFolder: migrationsFolder() }),
      close: async () => {
        await client.close();
        releaseLock();
      },
    };
  } catch (err) {
    releaseLock();
    throw err;
  }
}

/**
 * PGlite is single-process: a second process opening the same folder can
 * corrupt it. A pid lockfile turns that into a clear error.
 */
function acquireLock(dataDir: string): () => void {
  mkdirSync(path.dirname(dataDir), { recursive: true });
  const lockFile = `${dataDir}.lock`;
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, "utf8"));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `The local database ${dataDir} is in use by process ${pid} (e.g. "pnpm dev"). Stop it first, or set DATABASE_URL.`,
      );
    }
  }
  writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (readFileSync(lockFile, "utf8") === String(process.pid)) rmSync(lockFile);
    } catch {}
  };
  process.once("exit", release);
  return release;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Trivial query for the health check: throws when the database doesn't answer. */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
