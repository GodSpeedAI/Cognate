// RLM contract vocabulary (design D1/D2/D5). Two guarantees a prose review cannot give:
//   1. no provider/vendor identifier leaks into the provider-neutral contract, and
//   2. the capability-fact vocabulary is pinned to Gauntlet's agent-runner port so the two cannot drift.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  INVOCATION_STATUSES,
  ISOLATION_LEVELS,
  isDefiniteProviderRefusal,
  isTerminalInvocationStatus,
  PROVIDER_FACTS,
  readGrantRevocation,
  readInvocationBinding,
  RlmProviderRefusal,
  RESULT_DELIVERIES,
  RLM_AGENT_ID,
  RLM_CAPABILITIES,
  RLM_REFUSAL_CODES,
  TERMINAL_INVOCATION_STATUSES,
  TOOL_POLICIES,
  type RlmInvocationStatus,
} from "../src/index.ts";

// ── The Gauntlet port vocabulary this contract mirrors ──────────────────────────
// Source of truth: gauntlet-ports crate `crates/gauntlet-ports/src/agent_runner.rs` (§6.1, lines 162-229)
//   Isolation        = None | Process | Container | Vm
//   ResultDelivery   = File | Mailbox | ReturnValue
//   InvocationStatus = Admitted | Running | Completed | Failed | TimedOut | Cancelled
// Pinned inline rather than read across a repo boundary: a change on either side must be an explicit,
// reviewed edit here, which is the point.
const GAUNTLET_ISOLATION = ["none", "process", "container", "vm"] as const;
const GAUNTLET_RESULT_DELIVERY = ["file", "mailbox", "return"] as const; // ReturnValue -> return
const GAUNTLET_TERMINAL_STATUS = ["completed", "failed", "timedOut", "cancelled"] as const;

const SRC = join(import.meta.dir, "..", "src");

describe("RLM capability-fact vocabulary parity with the Gauntlet port", () => {
  test("isolation ladder matches Gauntlet's Isolation enum", () => {
    expect([...ISOLATION_LEVELS]).toEqual([...GAUNTLET_ISOLATION]);
  });

  test("result delivery matches Gauntlet's ResultDelivery enum (return = return_value)", () => {
    expect([...RESULT_DELIVERIES]).toEqual([...GAUNTLET_RESULT_DELIVERY]);
  });

  test("the four terminal statuses match Gauntlet's InvocationStatus::is_terminal set", () => {
    expect([...TERMINAL_INVOCATION_STATUSES]).toEqual([...GAUNTLET_TERMINAL_STATUS]);
  });

  test("every Gauntlet status is present, plus exactly one addition: unknown", () => {
    for (const status of ["admitted", "running", ...GAUNTLET_TERMINAL_STATUS]) expect(INVOCATION_STATUSES).toContain(status as RlmInvocationStatus);
    // The only status we add beyond Gauntlet's set is `unknown`.
    const additions = INVOCATION_STATUSES.filter((s) => s !== "admitted" && s !== "running" && !(GAUNTLET_TERMINAL_STATUS as readonly string[]).includes(s));
    expect(additions).toEqual(["unknown"]);
  });

  test("terminality is exactly the four pinned statuses; unknown is never terminal", () => {
    for (const status of INVOCATION_STATUSES) expect(isTerminalInvocationStatus(status)).toBe((GAUNTLET_TERMINAL_STATUS as readonly string[]).includes(status));
    expect(isTerminalInvocationStatus("unknown")).toBe(false);
  });

  test("admission policies and the fact list are closed sets", () => {
    expect([...TOOL_POLICIES]).toEqual(["bridge-only", "contained", "unattested"]);
    expect([...PROVIDER_FACTS]).toEqual(["maxDepth", "contextDecomposition", "providerInternalSubagents", "streaming", "isolation", "resultDelivery", "cancellation", "paymentMetering"]);
    expect([...RLM_REFUSAL_CODES]).toEqual([
      "rlm-provider-unknown", "rlm-provider-unavailable", "rlm-posture-refused", "rlm-authority-exceeds-parent", "rlm-depth-exceeded", "rlm-budget-unverifiable",
      "rlm-containment-unavailable", "rlm-port-unavailable", "rlm-egress-uncontrolled", "rlm-context-digest-mismatch", "rlm-invocation-unknown",
      "rlm-invocation-ambiguous", "rlm-top-level-invocation", "rlm-attempt-refused",
    ]);
  });
});

describe("no provider or vendor identifier leaks into the provider-neutral contract", () => {
  test("no capability id carries a vendor name", () => {
    for (const id of Object.values(RLM_CAPABILITIES)) expect(id).toMatch(/^rlm\.(providers|invoke|inspect|cancel)$/);
    expect(RLM_AGENT_ID).toBe("agent.rlm");
  });

  test("the forbidden vendor token appears nowhere in packages/runtime-api/src", () => {
    const offenders = readdirSync(SRC)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => /prime/i.test(readFileSync(join(SRC, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("state readers never resolve inherited members (#113)", () => {
  const binding = { invocationId: "real", runId: "r", providerId: "p", parentRunId: "x", depth: 1, contextDigest: "d", admittedAt: "t", budgetLimit: "unknown" };
  const state = JSON.parse(`{"rlm":{"invocations":{"real":${JSON.stringify(binding)}},"revoked":{"real":"withdrawn"}}}`);
  test.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])("%s is neither a binding nor a revocation", (id) => {
    expect(readInvocationBinding(state, id)).toBeUndefined();
    expect(readGrantRevocation(state, id)).toBeUndefined();
  });
  test("an own key named like an inherited member still resolves", () => {
    const own = JSON.parse(`{"rlm":{"invocations":{"__proto__":${JSON.stringify(binding)}},"revoked":{"constructor":"gone"}}}`);
    expect(readInvocationBinding(own, "__proto__")).toMatchObject({ invocationId: "real" });
    expect(readGrantRevocation(own, "constructor")).toBe("gone");
    expect(readGrantRevocation(own, "toString")).toBeUndefined();
  });
  test("the wildcard and the specific key both revoke; nothing else does", () => {
    expect(readGrantRevocation(state, "real")).toBe("withdrawn");
    expect(readGrantRevocation({ rlm: { revoked: { "*": "all" } } }, "anything")).toBe("all");
    expect(readGrantRevocation({ rlm: {} }, "anything")).toBeUndefined();
  });
});

describe("a provider's definite refusal is typed (#113)", () => {
  test("only a branded RlmProviderRefusal is definite", () => {
    expect(isDefiniteProviderRefusal(new RlmProviderRefusal("nothing ran"))).toBe(true);
    expect(isDefiniteProviderRefusal(Object.assign(new Error("x"), { definite: true }))).toBe(false); // duck typing is not a refusal
    expect(new RlmProviderRefusal("secret detail", "quota").code).toBe("quota");
    expect(new RlmProviderRefusal("secret detail", "Has Spaces And Secrets sk-1").code).toBe("refused");
    expect(isDefiniteProviderRefusal(new Error("timeout"))).toBe(false);
    const branded = (code: unknown) => Object.assign(new Error("x"), { [Symbol.for("cognate.rlm.providerRefusal")]: true, code });
    expect(isDefiniteProviderRefusal(branded("quota"))).toBe(true);
    expect(isDefiniteProviderRefusal(branded("sk-live-SECRET token"))).toBe(false); // an unbounded code is not a refusal
    expect(isDefiniteProviderRefusal(branded(5))).toBe(false);
    expect(isDefiniteProviderRefusal("string")).toBe(false);
    expect(isDefiniteProviderRefusal(undefined)).toBe(false);
  });
});
