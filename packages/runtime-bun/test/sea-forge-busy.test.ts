// SEA-Forge answers `server_busy` (with `no_side_effect: true`) when its request admission is full. That is
// backpressure, not a decision: the client retries it inside its timeout and never turns it into a denial
// while time remains. Any other answer, and a busy answer without the no-side-effect promise, is not retried.
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exchange, isServerBusy } from "../src/sea-forge-authority.ts";

type Obj = Record<string, unknown>;
const BUSY = JSON.stringify({ error: "server request-work admission is full; retry after an admitted request settles", error_class: "server_busy", no_side_effect: true });

describe("SEA-Forge server_busy backpressure", () => {
  const sockets: string[] = [];
  const servers: { stop(close?: boolean): void }[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.stop(true);
    for (const p of sockets.splice(0)) rmSync(p, { force: true });
  });
  const fake = (answer: (n: number) => string) => {
    const path = join(tmpdir(), `cg-sf-busy-${process.pid}-${sockets.length}-${Math.random().toString(36).slice(2, 8)}.sock`);
    sockets.push(path);
    const seen: Obj[] = [];
    servers.push(Bun.listen({
      unix: path,
      socket: {
        data(socket, chunk) {
          seen.push(JSON.parse(chunk.toString("utf8").split("\n")[0]!));
          socket.write(`${answer(seen.length)}\n`);
        },
      },
    }));
    return { path, seen };
  };

  test("isServerBusy requires both the class and the no-side-effect promise", () => {
    expect(isServerBusy(JSON.parse(BUSY))).toBe(true);
    expect(isServerBusy({ error_class: "server_busy" })).toBe(false);
    expect(isServerBusy({ error_class: "server_busy", no_side_effect: "true" })).toBe(false);
    expect(isServerBusy({ error_class: "policy_denied", no_side_effect: true })).toBe(false);
    expect(isServerBusy(null)).toBe(false);
  });

  test("busy answers are retried and the eventual answer is returned", async () => {
    const sf = fake((n) => (n <= 2 ? BUSY : JSON.stringify({ ok: true, answer: n })));
    const response = await exchange(sf.path, { verb: "authority_approvals" }, 5_000, 1 << 16);
    expect(response).toEqual({ ok: true, answer: 3 });
    expect(sf.seen.length).toBe(3);
    // The same request is sent each time (it had no side effect, so resending is the retry).
    expect(new Set(sf.seen.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  test("a busy answer without the no-side-effect promise is returned as-is, not retried", async () => {
    const sf = fake(() => JSON.stringify({ error: "busy", error_class: "server_busy" }));
    const response = await exchange(sf.path, { verb: "authority_approvals" }, 5_000, 1 << 16);
    expect(response).toEqual({ error: "busy", error_class: "server_busy" });
    expect(sf.seen.length).toBe(1);
  });

  test("other refusals are never retried", async () => {
    const sf = fake(() => JSON.stringify({ error: "denied", error_class: "policy_denied", no_side_effect: true }));
    await exchange(sf.path, { verb: "authority_approvals" }, 5_000, 1 << 16);
    expect(sf.seen.length).toBe(1);
  });

  test("a server that stays busy gets the last busy answer back within the timeout budget", async () => {
    const sf = fake(() => BUSY);
    const started = Date.now();
    const response = await exchange(sf.path, { verb: "authority_approvals" }, 400, 1 << 16);
    const elapsed = Date.now() - started;
    expect(isServerBusy(response)).toBe(true);
    expect(sf.seen.length).toBeGreaterThan(1);
    expect(elapsed).toBeLessThan(400 + 150);
  });
});
