import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadReleaseTargets, PUBLIC_NPM_REGISTRY, verifySdkPublication } from "../scripts/verify-sdk-publication.mjs";

const version = "0.5.0";
const head = "a".repeat(40);
const response = (metadata, status = 200) => new Response(JSON.stringify(metadata), {
  status,
  headers: { "content-type": "application/json" },
});
const entries = (count = 45) => Array.from({ length: count }, (_, index) => ({ name: `@godspeedai/release-test-${index}` }));

test("public npm receipts verify all 45 packages with no more than five in flight", async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  const receipt = await verifySdkPublication({
    packages: entries(), version, head,
    async fetchImpl(url) {
      active++;
      peak = Math.max(peak, active);
      seen.push(url);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      const expected = entries().find((item) => url.endsWith(`${item.name.replace("/", "%2f")}/${version}`));
      return response({ name: expected?.name, version, gitHead: head });
    },
  });
  expect(receipt).toMatchObject({ registry: PUBLIC_NPM_REGISTRY, version, gitHead: head, verifiedCount: 45 });
  expect(receipt.packages).toHaveLength(45);
  expect(new Set(seen).size).toBe(45);
  expect(peak).toBeLessThanOrEqual(5);
  expect(peak).toBe(5);
});

test("temporary registry 404 retries and accepts the exact version once visible", async () => {
  let now = 0;
  let attempts = 0;
  const receipt = await verifySdkPublication({
    packages: [{ name: "@godspeedai/late-visible" }], version, head,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    retryWindowMs: 100,
    initialRetryDelayMs: 10,
    maxRetryDelayMs: 20,
    async fetchImpl() {
      attempts++;
      return attempts === 1 ? response({}, 404) : response({ name: "@godspeedai/late-visible", version, gitHead: head });
    },
  });
  expect(attempts).toBe(2);
  expect(receipt.packages[0]).toEqual({ name: "@godspeedai/late-visible", version, gitHead: head });
});

test("temporary registry request timeout retries before accepting the exact receipt", async () => {
  let attempts = 0;
  const receipt = await verifySdkPublication({
    packages: [{ name: "@godspeedai/retry-after-timeout" }], version, head,
    now: (() => { let value = 0; return () => value++; })(),
    sleep: async () => {},
    async fetchImpl() {
      attempts++;
      return attempts === 1 ? response({}, 408) : response({ name: "@godspeedai/retry-after-timeout", version, gitHead: head });
    },
  });
  expect(attempts).toBe(2);
  expect(receipt.packages[0]).toEqual({ name: "@godspeedai/retry-after-timeout", version, gitHead: head });
});

test("public receipt requests omit credentials and reject registry redirects", async () => {
  let requestOptions;
  const receipt = await verifySdkPublication({
    packages: [{ name: "@godspeedai/no-redirect" }], version, head,
    async fetchImpl(_url, options) {
      requestOptions = options;
      return response({ name: "@godspeedai/no-redirect", version, gitHead: head });
    },
  });
  expect(receipt.verifiedCount).toBe(1);
  expect(requestOptions.redirect).toBe("error");
  expect(requestOptions.credentials).toBe("omit");
  expect(requestOptions.headers).not.toHaveProperty("authorization");
});

test("a missing version fails at the bounded retry deadline", async () => {
  let now = 0;
  let attempts = 0;
  await expect(verifySdkPublication({
    packages: [{ name: "@godspeedai/not-published" }], version, head,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    retryWindowMs: 35,
    initialRetryDelayMs: 10,
    maxRetryDelayMs: 10,
    async fetchImpl() { attempts++; return response({}, 404); },
  })).rejects.toThrow("did not become verifiable before the retry deadline");
  expect(now).toBe(35);
  expect(attempts).toBe(4);
});

test("permanently missing first-wave packages do not starve later registry checks", async () => {
  let now = 0;
  const checked = new Set();
  await expect(verifySdkPublication({
    packages: entries(), version, head,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    retryWindowMs: 35,
    initialRetryDelayMs: 10,
    maxRetryDelayMs: 10,
    async fetchImpl(url) {
      const target = entries().find((item) => url.endsWith(`${item.name.replace("/", "%2f")}/${version}`));
      checked.add(target?.name);
      if (Number(target?.name?.split("-").at(-1)) < 5) return response({}, 404);
      return response({ name: target?.name, version, gitHead: head });
    },
  })).rejects.toThrow("Public npm verification failed for 5/45 package(s)");
  expect(checked.size).toBe(45);
  expect(now).toBe(35);
});

test("wrong version, wrong gitHead and malformed registry metadata fail closed", async () => {
  const packageName = "@godspeedai/wrong-receipt";
  await expect(verifySdkPublication({
    packages: [{ name: packageName }], version, head,
    async fetchImpl() { return response({ name: packageName, version: "0.4.0", gitHead: head }); },
  })).rejects.toThrow("different package name or version");
  await expect(verifySdkPublication({
    packages: [{ name: packageName }], version, head,
    async fetchImpl() { return response({ name: packageName, version, gitHead: "b".repeat(40) }); },
  })).rejects.toThrow("gitHead did not match");
  await expect(verifySdkPublication({
    packages: [{ name: packageName }], version, head,
    async fetchImpl() { return new Response("not json", { status: 200 }); },
  })).rejects.toThrow("malformed package metadata");
});

test("release target loading derives the complete linked package set and exact version", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const targets = await loadReleaseTargets(root);
  expect(targets.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(targets.packages).toHaveLength(45);
  expect(new Set(targets.packages.map((item) => item.name)).size).toBe(45);
});

test("release-created workflow runs the publication gate and fails when publishing was disabled", async () => {
  const workflow = parse(await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"));
  const job = workflow.jobs["verify-publication"];
  expect(job.if).toContain("always()");
  expect(job.if).toContain("needs.release-please.outputs.cognate_release_created == 'true'");

  const steps = job.steps;
  expect(steps[0]?.name).toMatch(/publication.*gate/i);
  expect(steps[1]?.uses).toBe("actions/checkout@v4");
  const gate = steps[0];
  const invokeGate = (ready, publishResult) => spawnSync("bash", ["-c", gate.run], {
    encoding: "utf8",
    env: { ...process.env, NPM_TRUSTED_PUBLISHING_READY: ready, NPM_PUBLISH_RESULT: publishResult },
  });

  expect(invokeGate("false", "skipped").status).not.toBe(0);
  expect(invokeGate("true", "failure").status).not.toBe(0);
  expect(invokeGate("true", "success").status).toBe(0);
});
