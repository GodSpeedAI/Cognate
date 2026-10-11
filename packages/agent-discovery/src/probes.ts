/**
 * Opt-in, allowlisted, read-only executable probes. No shell interpretation: arguments are
 * passed verbatim to execFile, and only the listed probe forms are ever attempted. A probe that
 * fails, times out, or prints anything surprising yields "unverified" evidence, never a guess.
 */
import { execFile } from "node:child_process";

export interface VersionProbe {
  /** First non-empty line of the probe output, e.g. "1.2.3 (Claude Code)". */
  readonly version?: string;
  readonly command: readonly string[];
  readonly evidence: string;
}

/** Per-harness allowlist: the ONLY arguments ever executed, for the resolved path only. */
const VERSION_PROBE_ARGS: Readonly<Record<string, readonly string[]>> = {
  claude: ["--version"],
  codex: ["--version"],
  gemini: ["--version"],
  opencode: ["--version"],
  pi: ["--version"],
  cline: ["--version"],
  "cursor-agent": ["--version"],
  windsurf: ["--version"],
  amp: ["--version"],
  goose: ["--version"],
  aider: ["--version"],
  qwen: ["--version"],
  kimi: ["--version"],
  copilot: ["--version"],
  roo: ["--version"],
  kilocode: ["--version"],
  cn: ["--version"],
};

export function probeAllowed(command: readonly string[]): boolean {
  if (command.length !== 2) return false;
  const known = Object.values(VERSION_PROBE_ARGS).some((args) => args[0] === command[1]);
  return known && typeof command[0] === "string";
}

function runProbe(executable: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, [...args], { timeout: timeoutMs, shell: false }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject(error);
        return;
      }
      resolve(String(stdout || stderr || ""));
    });
    child.on("error", reject);
  });
}

/** Probes one resolved executable; a refusal/failure is evidence, not an error. */
export async function probeVersion(harness: string, executablePath: string, timeoutMs = 5000): Promise<VersionProbe> {
  const args = VERSION_PROBE_ARGS[harness];
  if (!args) return { command: [executablePath], evidence: `no allowlisted version probe for ${harness}` };
  try {
    const output = await runProbe(executablePath, args, timeoutMs);
    const version = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return {
      ...(version ? { version } : {}),
      command: [executablePath, ...args],
      evidence: version ? `${executablePath} ${args.join(" ")} -> ${version}` : `${executablePath} ${args.join(" ")} produced no version line`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : "failed";
    return { command: [executablePath, ...args], evidence: `${executablePath} ${args.join(" ")} failed: ${reason}` };
  }
}
