#!/usr/bin/env bun
// `cognate create <dir> [--profile copilot|harness] [--source <path>] [--with a,b]` | `cognate dev [--port N]`
import { CLI_VERSION, create, dev } from "./index.ts";

function parseFlags(argv: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      flags[key] = value !== undefined && !value.startsWith("--") ? value : "true";
      if (flags[key] !== "true") i += 1;
    }
  }
  return flags;
}

async function runCreate(args: readonly string[]): Promise<void> {
  const dir = args[0];
  if (!dir || dir.startsWith("--")) {
    console.error("cognate create: missing <dir>");
    process.exit(1);
  }
  const flags = parseFlags(args.slice(1));
  const profile = flags.profile;
  if (profile !== "copilot" && profile !== "harness") {
    console.error("cognate create: --profile must be 'copilot' or 'harness'");
    process.exit(1);
  }
  if (flags.source === "true") {
    console.error("cognate create: --source needs a path to a Cognate checkout");
    process.exit(1);
  }
  const source = flags.source;
  const withList = flags.with && flags.with !== "true" ? flags.with.split(",").map((name) => name.trim()).filter(Boolean) : undefined;

  const report = await create({ dir, profile, source, with: withList });
  for (const entry of report.unsupported) console.log(`unsupported: ${entry.name} (${entry.reason})`);
  const packages = source === undefined ? `@godspeedai/* packages pinned to ${CLI_VERSION} from npm` : `vendored ${report.vendored.length} package(s) from ${source}`;
  console.log(`created ${report.dir} (${packages})`);
}

async function runDev(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const port = flags.port ? Number(flags.port) : 3000;
  const server = await dev({ dir: process.cwd(), port });
  console.log(`listening on ${server.url}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === "create") await runCreate(rest);
    else if (command === "dev") await runDev(rest);
    else {
      console.error("cognate: usage: cognate create <dir> --profile copilot|harness [--source <checkout>] [--with a,b] | cognate dev [--port N]");
      process.exit(1);
    }
  } catch (error) {
    console.error(`cognate ${command}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
