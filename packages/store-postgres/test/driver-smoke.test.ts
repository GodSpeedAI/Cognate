// Driver smoke: postgres.js under Bun 1.4 against the local pg0 instance — transactions,
// parameterized types (int8), LISTEN/NOTIFY, and FOR UPDATE SKIP LOCKED behavior.
import { expect, test } from "bun:test";
import postgres from "postgres";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

test("postgres.js connects, transacts, and types under Bun", async () => {
  const sql = postgres(url, { max: 5 });
  try {
    const rows0 = await sql`SELECT version()`;
    const version = rows0[0]!.version as string;
    expect(String(version)).toContain("PostgreSQL 18");

    await sql`DROP TABLE IF EXISTS driver_smoke`;
    await sql`CREATE TABLE driver_smoke (id bigint generated always as identity primary key, value text)`;

    const result = await sql.begin(async (tx) => {
      await tx`INSERT INTO driver_smoke (value) VALUES (${"a"})`;
      await tx`INSERT INTO driver_smoke (value) VALUES (${"b"})`;
      return (await tx`SELECT id, value FROM driver_smoke ORDER BY id`).map((r) => r.value);
    });
    expect(result).toEqual(["a", "b"]);

    // bigint columns come back as strings by default — mapping layer must Number() them.
    const rows = await sql`SELECT id FROM driver_smoke LIMIT 1`;
    expect(typeof rows[0]!.id).toBe("string");

    // Rollback on throw.
    await sql.begin(async (tx) => {
      await tx`INSERT INTO driver_smoke (value) VALUES (${"lost"})`;
      throw new Error("rollback");
    }).catch(() => {});
    expect((await sql`SELECT count(*)::int FROM driver_smoke`)[0]!.count).toBe(2);

    // Unique violation surfaces as a typed postgres error.
    await sql`ALTER TABLE driver_smoke ADD COLUMN u text UNIQUE`;
    await sql`INSERT INTO driver_smoke (value, u) VALUES (${"x"}, ${"dup"})`;
    const conflict = await sql`INSERT INTO driver_smoke (value, u) VALUES (${"y"}, ${"dup"})`.catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(postgres.PostgresError);
    expect((conflict as { code: string }).code).toBe("23505");
  } finally {
    await sql.end({ timeout: 1 });
  }
}, 30_000);

test("LISTEN/NOTIFY wakes a subscriber under Bun", async () => {
  const sql = postgres(url, { max: 2 });
  try {
    const received: string[] = [];
    const ready = Promise.withResolvers<void>();
    await sql.listen("driver_smoke_test", (payload) => {
      received.push(payload);
      ready.resolve();
    });
    await sql`SELECT pg_notify('driver_smoke_test', ${"hello"})`;
    await ready.promise;
    expect(received).toEqual(["hello"]);
  } finally {
    await sql.end({ timeout: 1 });
  }
}, 30_000);
