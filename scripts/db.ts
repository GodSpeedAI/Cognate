// Local PostgreSQL lifecycle over the pinned pg0 binary (`just db-setup`): up, down, status,
// migrate, backup, restore. Paths stay portable: the binary lives in .tmp/pg0, the pg0 instance and
// its bundled pg_dump are discovered, never hard-coded.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openPostgresStore, resolvePg0Url } from "@godspeedai/cognate-store-postgres";

const INSTANCE = "cognate-dev";
const SCHEMA = process.env.COGNATE_PG_SCHEMA ?? "cognate";
const BACKUP_DIR = ".tmp/backups";

function bin(): string {
  if (process.env.COGNATE_PG0_BIN) return process.env.COGNATE_PG0_BIN;
  if (existsSync(".tmp/pg0/pg0")) return ".tmp/pg0/pg0";
  console.error("db: pg0 is not installed — run `just db-setup` first");
  process.exit(1);
}

function pg0(args: string[]): number {
  const result = spawnSync(bin(), args, { stdio: "inherit" });
  return result.status ?? 1;
}

function bundledPgDump(): string | undefined {
  const installation = join(process.env.HOME ?? "", ".pg0", "installation");
  if (!existsSync(installation)) return undefined;
  for (const version of readdirSync(installation).sort().reverse()) {
    const dump = join(installation, version, "bin", "pg_dump");
    if (existsSync(dump) && statSync(dump).isFile()) return dump;
  }
  return undefined;
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "up": {
    // resolvePg0Url starts the instance when it is not running and prints the URL it verified.
    const url = await resolvePg0Url({ name: rest[0] ?? INSTANCE });
    console.log(`db: instance is running at ${url}`);
    break;
  }
  case "down":
    process.exit(pg0(["stop", "--name", rest[0] ?? INSTANCE]));
    break;
  case "status":
    process.exit(pg0(["info", "--name", rest[0] ?? INSTANCE]));
    break;
  case "migrate": {
    // Opening the store applies versioned schema migrations under the migration advisory lock.
    const url = await resolvePg0Url({ name: rest[0] ?? INSTANCE });
    const handle = await openPostgresStore({ url, schema: SCHEMA });
    console.log(`db: migrations applied to schema "${SCHEMA}"`);
    await handle.close();
    break;
  }
  case "backup": {
    const dump = bundledPgDump();
    if (!dump) {
      console.error("db: pg_dump not found under ~/.pg0/installation — start the instance once (just db-up)");
      process.exit(1);
    }
    const url = await resolvePg0Url({ name: rest[0] ?? INSTANCE, noStart: false });
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `${SCHEMA}-${new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "")}.sql`);
    const parsed = new URL(url);
    const result = spawnSync(dump, ["--host", parsed.hostname, "--port", parsed.port || "5432", "--username", parsed.username, "--schema", SCHEMA, "--file", file, parsed.pathname.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`db: backup written to ${file}`);
    break;
  }
  case "restore": {
    const file = rest[0];
    if (!file || !existsSync(file)) {
      console.error("db: restore needs a backup file path (psql-format, from `just db-backup`)");
      process.exit(1);
    }
    const url = await resolvePg0Url({ name: INSTANCE });
    const parsed = new URL(url);
    const psql = bundledPgDump()?.replace(/pg_dump$/, "psql");
    if (!psql || !existsSync(psql)) {
      console.error("db: psql not found under ~/.pg0/installation");
      process.exit(1);
    }
    const result = spawnSync(psql, ["--host", parsed.hostname, "--port", parsed.port || "5432", "--username", parsed.username, "--file", file, parsed.pathname.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
    });
    process.exit(result.status ?? 1);
    break;
  }
  default:
    console.log("usage: bun scripts/db.ts <up|down|status|migrate|backup|restore> [args]");
    process.exit(command ? 1 : 0);
}
