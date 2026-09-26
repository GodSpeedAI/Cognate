import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createClient } from "@cognate/client";
import { connectTransport, devToken } from "@cognate/protocol-connect-bun";
import { createRemoteRuntimeService } from "@cognate/protocol-connect";
import { startServer, LOCAL_OPERATOR, type AppServer } from "../src/server.ts";

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "deepseek-harness-t5-"));
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export async function bootApp(home: string): Promise<{ readonly app: AppServer; readonly client: ReturnType<typeof createClient> }> {
  const app = await startServer({ port: 0, home });
  const transport = connectTransport(app.url);
  const service = createRemoteRuntimeService(transport, () => devToken(LOCAL_OPERATOR));
  const client = createClient({ service, caller: LOCAL_OPERATOR });
  return { app, client };
}

const MOCK_MODEL_SCRIPT = fileURLToPath(new URL("../../fixtures/mock-model/server.ts", import.meta.url));

export interface MockModel {
  readonly port: number;
  stop(): Promise<void>;
}

/**
 * Runs the T1 deterministic mock model server as a real, separate process (`bun
 * fixtures/mock-model/server.ts --port=0`) rather than importing its module directly, so this app's
 * strict tsconfig never has to typecheck a file owned by another tranche.
 */
export async function bootMockModel(): Promise<MockModel> {
  const proc = Bun.spawn(["bun", MOCK_MODEL_SCRIPT, "--port=0"], { stdout: "pipe", stderr: "pipe" });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let port: number | undefined;
  const deadline = Date.now() + 10_000;
  while (port === undefined && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(buffer);
    if (match) port = Number(match[1]);
  }
  if (port === undefined) throw new Error("mock model server did not report a port in time");
  return {
    port,
    async stop() {
      proc.kill();
      await proc.exited;
    },
  };
}
