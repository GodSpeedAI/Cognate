import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright runs from landing/ (see test:e2e), so paths resolve from the working directory.
export const PID_FILE = resolve(process.cwd(), 'tests/e2e/.preview.pid');

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => ok(port));
    });
  });
}

async function waitForOk(url: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not answer 200 at ${url}`);
}

/** Builds once, then serves dist/ with scripts/serve.ts on a free port, in its own process group. */
export async function startServer(): Promise<string> {
  execFileSync('bun', ['run', 'build'], { cwd: process.cwd(), stdio: 'inherit' });
  const port = await freePort();
  const child = spawn('bun', ['scripts/serve.ts', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (!child.pid) throw new Error('failed to spawn scripts/serve.ts');
  writeFileSync(PID_FILE, String(child.pid));
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForOk(`${baseUrl}/`);
  return baseUrl;
}

export function stopServer(): void {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
  unlinkSync(PID_FILE);
}
