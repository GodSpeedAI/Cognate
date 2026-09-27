#!/usr/bin/env bun
// T13 journey-suite runner: runs the full journeys/ suite for SYSTEM=reference then
// SYSTEM=cognate, writes results/<system>.json (per journey: pass/fail, duration, failure message,
// evidence screenshot paths) plus results/summary.md (a side-by-side table).
//
// Flakiness: passes --retries=2 to Playwright so a failing journey gets re-run up to 2 more times
// before being called a genuine failure; a journey that fails then later passes is recorded as
// "flaky" (not silently reported as a clean pass) rather than folded into "passed".
//
// Usage: bun run journeys/run.ts [reference|cognate|both]  (default: both)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = join(HERE, "..");
const RESULTS_DIR = join(HERE, "results");
mkdirSync(RESULTS_DIR, { recursive: true });

type SystemName = "reference" | "cognate";
type Outcome = "passed" | "failed" | "flaky" | "timedOut" | "skipped";

interface JourneyResult {
  journeyId: string; // e.g. "A-first-use"
  title: string;
  outcome: Outcome;
  attempts: number;
  durationMs: number;
  failureMessage?: string;
  evidence: string[];
}

// Playwright's JSON reporter shape (subset used here). See
// https://playwright.dev/docs/test-reporters#json-reporter.
interface PWReportTest {
  status: string;
  duration: number;
  errors?: Array<{ message?: string }>;
  attachments?: Array<{ name: string; path?: string; contentType: string }>;
}
interface PWReportSpec {
  title: string;
  file: string;
  tests: Array<{ status: string; results: PWReportTest[] }>;
}
interface PWReportSuite {
  title: string;
  specs?: PWReportSpec[];
  suites?: PWReportSuite[];
}
interface PWReport {
  suites: PWReportSuite[];
}

function journeyIdFromFile(file: string): string {
  // "journeys/A-first-use.spec.ts" -> "A-first-use"
  const base = file.split("/").pop() ?? file;
  return base.replace(/\.spec\.ts$/, "");
}

function walkSpecs(suite: PWReportSuite, out: PWReportSpec[]): void {
  for (const spec of suite.specs ?? []) out.push(spec);
  for (const child of suite.suites ?? []) walkSpecs(child, out);
}

function runSystem(system: SystemName): JourneyResult[] {
  const rawReportPath = join(RESULTS_DIR, `.raw-${system}.json`);
  rmSync(rawReportPath, { force: true });

  console.log(`\n=== Running journeys/ for SYSTEM=${system} ===\n`);
  const proc = spawnSync(
    "bun",
    ["x", "playwright", "test", "journeys/", "--config=playwright.config.ts", "--reporter=json", "--workers=1", "--retries=2", "--timeout=180000"],
    {
      cwd: TESTS_DIR,
      env: { ...process.env, SYSTEM: system, PLAYWRIGHT_JSON_OUTPUT_NAME: rawReportPath },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    },
  );
  if (proc.error) throw proc.error;
  // Non-zero exit just means some test failed - the JSON report is still what we read from.
  if (proc.stderr) process.stderr.write(proc.stderr);

  const report = JSON.parse(readFileSync(rawReportPath, "utf8")) as PWReport;
  const specs: PWReportSpec[] = [];
  for (const suite of report.suites) walkSpecs(suite, specs);

  const results: JourneyResult[] = [];
  for (const spec of specs) {
    for (const test of spec.tests) {
      const attempts = test.results.length;
      const last = test.results[attempts - 1];
      const firstFailed = test.results[0]?.status !== "passed";
      const lastPassed = last?.status === "passed";
      let outcome: Outcome;
      if (lastPassed && attempts > 1 && firstFailed) outcome = "flaky";
      else if (last?.status === "timedOut") outcome = "timedOut";
      else if (lastPassed) outcome = "passed";
      else if (last?.status === "skipped") outcome = "skipped";
      else outcome = "failed";

      const evidence = (last?.attachments ?? [])
        .filter((a) => a.contentType === "image/png" && a.path)
        .map((a) => relative(TESTS_DIR, a.path!));

      results.push({
        journeyId: journeyIdFromFile(spec.file),
        title: spec.title,
        outcome,
        attempts,
        durationMs: test.results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
        failureMessage: lastPassed ? undefined : last?.errors?.[0]?.message?.split("\n")[0],
        evidence,
      });
    }
  }
  return results;
}

function writeSummary(all: Record<SystemName, JourneyResult[]>): void {
  const ids = Array.from(new Set([...all.reference.map((r) => r.journeyId), ...all.cognate.map((r) => r.journeyId)])).sort();
  const byIdRef = Object.fromEntries(all.reference.map((r) => [r.journeyId + "::" + r.title, r]));
  const byIdCog = Object.fromEntries(all.cognate.map((r) => [r.journeyId + "::" + r.title, r]));
  const rows: string[] = [];
  rows.push("| Journey | Test | Reference | Duration | Cognate | Duration |");
  rows.push("|---|---|---|---|---|---|");
  const allKeys = Array.from(new Set([...Object.keys(byIdRef), ...Object.keys(byIdCog)])).sort();
  for (const key of allKeys) {
    const [journeyId, title] = key.split("::");
    const r = byIdRef[key];
    const c = byIdCog[key];
    const fmt = (x?: JourneyResult) => (x ? `${badge(x.outcome)}${x.attempts > 1 ? ` (${x.attempts} attempts)` : ""}` : "—");
    const dur = (x?: JourneyResult) => (x ? `${(x.durationMs / 1000).toFixed(1)}s` : "—");
    rows.push(`| ${journeyId} | ${title} | ${fmt(r)} | ${dur(r)} | ${fmt(c)} | ${dur(c)} |`);
  }

  const failures: string[] = [];
  for (const [system, results] of Object.entries(all) as [SystemName, JourneyResult[]][]) {
    for (const r of results) {
      if (r.outcome === "failed" || r.outcome === "timedOut" || r.outcome === "flaky") {
        failures.push(`- **${system} / ${r.journeyId} / ${r.title}** (${r.outcome}): ${r.failureMessage ?? "(no message)"}`);
      }
    }
  }

  const md = [
    "# Journey suite results - reference vs Cognate",
    "",
    `Generated ${new Date().toISOString()}.`,
    "",
    rows.join("\n"),
    "",
    "## Failures and flakes",
    "",
    failures.length ? failures.join("\n") : "(none)",
    "",
  ].join("\n");
  writeFileSync(join(RESULTS_DIR, "summary.md"), md);
}

function badge(outcome: Outcome): string {
  switch (outcome) {
    case "passed": return "PASS";
    case "failed": return "FAIL";
    case "timedOut": return "TIMEOUT";
    case "flaky": return "FLAKY";
    case "skipped": return "SKIP";
  }
}

const arg = process.argv[2] as SystemName | "both" | undefined;
const systems: SystemName[] = arg === "reference" || arg === "cognate" ? [arg] : ["reference", "cognate"];

const all: Partial<Record<SystemName, JourneyResult[]>> = {};
for (const system of systems) {
  const results = runSystem(system);
  all[system] = results;
  writeFileSync(join(RESULTS_DIR, `${system}.json`), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${join(RESULTS_DIR, `${system}.json`)}`);
}

if (all.reference && all.cognate) {
  writeSummary({ reference: all.reference, cognate: all.cognate });
  console.log(`Wrote ${join(RESULTS_DIR, "summary.md")}`);
}
