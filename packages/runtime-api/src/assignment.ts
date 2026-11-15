// Assignment binding (FDE WP-23): the id grammar, the payload validator and the lifecycle state machine of
// `assignment.v1` (SEA-Forge contract, vendored by digest in ../schemas/). Pure: no clock, no I/O. The constants
// below are read from the vendored schema, so a re-vendored schema changes this module's behavior or fails the
// differential tests; the semantic rules (README section 11) are the ones a schema cannot state.
import assignmentSchema from "../schemas/assignment.v1.json";
import frozenReferenceSchema from "../schemas/frozen-reference.v1.json";
import { ServiceError, type ServiceErrorCode } from "./types.ts";

export type AssignmentCode =
  | "ASSIGNMENT_ID_INVALID"
  | "ASSIGNMENT_EPISODE_CHANGED"
  | "ASSIGNMENT_TRANSITION_INVALID"
  | "ASSIGNMENT_BUDGET_INVALID"
  | "ASSIGNMENT_BUDGET_EXCEEDED"
  | "ASSIGNMENT_LINK_EXPIRED";

export type Currency = "time" | "attention" | "money" | "risk" | "recovery";
export type AssignmentEventName = "issued" | "started" | "interrupted" | "resumed" | "completed" | "failed" | "cancelled";

export interface BudgetEntry {
  readonly currency: Currency;
  /** A number >= 0, or `unknown`: an unmeasured limit is never 0 (SOP 5.3). */
  readonly limit: number | "unknown";
  readonly unit: string;
}
export interface SpendEntry {
  readonly currency: Currency;
  readonly spent: number | "unknown";
}
export interface AssignmentBrief {
  readonly instruction: string;
  readonly adoptable_problem: string;
  readonly domain_meaning: string;
  readonly context_refs: readonly { readonly ref: string; readonly trust: "untrusted_reference" }[];
}
/** The `Assignment` def of assignment.v1 (snake_case, as on the wire). */
export interface Assignment {
  readonly assignment_id: string;
  readonly case_id: string;
  readonly step_id: string;
  readonly n: number;
  readonly k: number;
  readonly episode_ref: string;
  readonly brief: AssignmentBrief;
  readonly budget: readonly BudgetEntry[];
  readonly issued_at: string;
}
/** The `Event` def of assignment.v1. */
export interface AssignmentEvent {
  readonly assignment_id: string;
  readonly episode_ref: string;
  readonly event: AssignmentEventName;
  readonly at: string;
  readonly spend: readonly SpendEntry[];
  readonly reason?: string;
}

export interface AssignmentIssue {
  /** JSON pointer into the validated value (`""` is the root). */
  readonly pointer: string;
  readonly message: string;
}
export type AssignmentValidation<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      /** The contract code when the refusal is one of the ASSIGNMENT_* rules; absent for a plain schema violation. */
      readonly code?: AssignmentCode;
      readonly issues: readonly AssignmentIssue[];
    };

type Obj = { readonly [key: string]: unknown };
const defs = (assignmentSchema as unknown as { $defs: Record<string, any> }).$defs;

/** `assign:<caseId>:<stepId>:<n>:<k>` (schema `$defs.assignment_id`). */
export const ASSIGNMENT_ID_PATTERN = new RegExp(defs.assignment_id.pattern);
export const ASSIGNMENT_ID_MAX_LENGTH: number = defs.assignment_id.maxLength;
const EPISODE_REF_PATTERN = new RegExp((frozenReferenceSchema as any).$defs.episode_ref.pattern);
const TOKEN_PATTERN = new RegExp(defs.tok.pattern);
const TIMESTAMP_PATTERN = new RegExp(defs.Assignment.properties.issued_at.pattern);
const TEXT_MAX: number = defs.text.maxLength;
export const CURRENCIES: readonly Currency[] = defs.Budget.items.properties.currency.enum;
export const EVENT_NAMES: readonly AssignmentEventName[] = defs.Event.properties.event.enum;
export const ASSIGNMENT_CODES: readonly AssignmentCode[] = defs.Error.properties.code.enum;
const REASON_REQUIRED: readonly string[] = defs.Event.if.properties.event.enum;
const BRIEF_REQUIRED: readonly string[] = defs.Brief.required;
const ASSIGNMENT_REQUIRED: readonly string[] = defs.Assignment.required;
const EVENT_REQUIRED: readonly string[] = defs.Event.required;
const ERROR_REQUIRED: readonly string[] = defs.Error.required;
const BUDGET_SIZE: number = defs.Budget.minItems;
const SPEND_SIZE: number = defs.Spend.minItems;
/** The unit rule per currency: an enum of exact units, or (money) a pattern. */
const UNIT_RULES: ReadonlyMap<string, { readonly enum?: readonly string[]; readonly pattern?: RegExp }> = new Map(
  (defs.Budget.items.allOf as any[]).map((rule) => {
    const unit = rule.then.properties.unit;
    return [rule.if.properties.currency.const as string, { ...(unit.enum ? { enum: unit.enum as string[] } : {}), ...(unit.pattern ? { pattern: new RegExp(unit.pattern) } : {}) }];
  }),
);

// ── id grammar ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ParsedAssignmentId {
  readonly caseId: string;
  readonly stepId: string;
  readonly n: number;
  readonly k: number;
}

/** Parse `assign:<caseId>:<stepId>:<n>:<k>`; `undefined` when it does not match the contract pattern or bound. */
export function parseAssignmentId(id: unknown): ParsedAssignmentId | undefined {
  if (typeof id !== "string" || id.length > ASSIGNMENT_ID_MAX_LENGTH) return undefined;
  const match = ASSIGNMENT_ID_PATTERN.exec(id);
  if (!match) return undefined;
  return { caseId: match[1]!, stepId: match[2]!, n: Number(match[3]), k: Number(match[4]) };
}

/** Format an id; throws `RangeError` when the parts cannot form a contract-valid id. */
export function formatAssignmentId(parts: ParsedAssignmentId): string {
  const id = `assign:${parts.caseId}:${parts.stepId}:${parts.n}:${parts.k}`;
  if (!parseAssignmentId(id) || !Number.isSafeInteger(parts.n) || !Number.isSafeInteger(parts.k)) throw new RangeError(`not a valid assignment id: ${id}`);
  return id;
}

/** `episode:<case>:<item>:<n>@sha256:<64 hex>` into its parts; `undefined` when it does not match the frozen-reference pattern. */
export function parseEpisodeRef(ref: unknown): { readonly caseId: string; readonly planItemId: string; readonly n: number } | undefined {
  if (typeof ref !== "string" || !EPISODE_REF_PATTERN.test(ref)) return undefined;
  const [caseId, planItemId, n] = ref.slice("episode:".length, ref.indexOf("@")).split(":");
  return { caseId: caseId!, planItemId: planItemId!, n: Number(n) };
}

// ── schema validation (shape) ──────────────────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function checkKeys(value: Obj, pointer: string, required: readonly string[], allowed: readonly string[], issues: AssignmentIssue[]): void {
  for (const key of required) if (!(key in value)) issues.push({ pointer, message: `"${key}" is a required property` });
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ pointer, message: `Additional properties are not allowed ("${key}" was unexpected)` });
}
function checkText(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (typeof value !== "string" || value.length < 1 || value.length > TEXT_MAX) issues.push({ pointer, message: `must be a string of 1 to ${TEXT_MAX} characters` });
}
function checkTimestamp(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (typeof value !== "string" || value.length > TEXT_MAX || !TIMESTAMP_PATTERN.test(value)) issues.push({ pointer, message: "does not match the UTC timestamp pattern" });
}
function checkAmount(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!(isNum(value) && value >= 0) && value !== "unknown") issues.push({ pointer, message: 'is not valid under any of the schemas (a number >= 0 or "unknown")' });
}
function checkAssignmentId(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!parseAssignmentId(value)) issues.push({ pointer, message: `does not match ${ASSIGNMENT_ID_PATTERN.source} (at most ${ASSIGNMENT_ID_MAX_LENGTH} characters)` });
}
function checkEpisodeRef(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!parseEpisodeRef(value)) issues.push({ pointer, message: `does not match ${EPISODE_REF_PATTERN.source}` });
}
function checkBrief(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!isObj(value)) return void issues.push({ pointer, message: "must be an object" });
  checkKeys(value, pointer, BRIEF_REQUIRED, BRIEF_REQUIRED, issues);
  for (const key of ["instruction", "adoptable_problem", "domain_meaning"]) if (key in value) checkText(value[key], `${pointer}/${key}`, issues);
  const refs = value.context_refs;
  if (refs === undefined) return;
  if (!Array.isArray(refs) || refs.length > defs.Brief.properties.context_refs.maxItems) return void issues.push({ pointer: `${pointer}/context_refs`, message: "must be an array of at most 256 entries" });
  refs.forEach((entry, index) => {
    const at = `${pointer}/context_refs/${index}`;
    if (!isObj(entry)) return void issues.push({ pointer: at, message: "must be an object" });
    checkKeys(entry, at, ["ref", "trust"], ["ref", "trust"], issues);
    if ("ref" in entry) checkText(entry.ref, `${at}/ref`, issues);
    if ("trust" in entry && entry.trust !== "untrusted_reference") issues.push({ pointer: `${at}/trust`, message: 'was expected to be "untrusted_reference"' });
  });
}
function checkBudget(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!Array.isArray(value)) return void issues.push({ pointer, message: "must be an array" });
  if (value.length !== BUDGET_SIZE) issues.push({ pointer, message: `has ${value.length < BUDGET_SIZE ? "less" : "more"} than ${BUDGET_SIZE} items` });
  value.forEach((entry, index) => {
    const at = `${pointer}/${index}`;
    if (!isObj(entry)) return void issues.push({ pointer: at, message: "must be an object" });
    checkKeys(entry, at, ["currency", "limit", "unit"], ["currency", "limit", "unit"], issues);
    const currencyOk = CURRENCIES.includes(entry.currency as Currency);
    if ("currency" in entry && !currencyOk) issues.push({ pointer: `${at}/currency`, message: `is not one of ${JSON.stringify(CURRENCIES)}` });
    if ("limit" in entry) checkAmount(entry.limit, `${at}/limit`, issues);
    if ("unit" in entry) {
      checkText(entry.unit, `${at}/unit`, issues);
      const rule = currencyOk ? UNIT_RULES.get(entry.currency as string) : undefined;
      if (rule?.enum && !rule.enum.includes(entry.unit as string)) issues.push({ pointer: `${at}/unit`, message: `is not one of ${JSON.stringify(rule.enum)}` });
      if (rule?.pattern && !(typeof entry.unit === "string" && rule.pattern.test(entry.unit))) issues.push({ pointer: `${at}/unit`, message: `does not match ${rule.pattern.source}` });
    }
  });
}
function checkSpend(value: unknown, pointer: string, issues: AssignmentIssue[]): void {
  if (!Array.isArray(value)) return void issues.push({ pointer, message: "must be an array" });
  if (value.length !== SPEND_SIZE) issues.push({ pointer, message: `has ${value.length < SPEND_SIZE ? "less" : "more"} than ${SPEND_SIZE} items` });
  value.forEach((entry, index) => {
    const at = `${pointer}/${index}`;
    if (!isObj(entry)) return void issues.push({ pointer: at, message: "must be an object" });
    checkKeys(entry, at, ["currency", "spent"], ["currency", "spent"], issues);
    if ("currency" in entry && !CURRENCIES.includes(entry.currency as Currency)) issues.push({ pointer: `${at}/currency`, message: `is not one of ${JSON.stringify(CURRENCIES)}` });
    if ("spent" in entry) checkAmount(entry.spent, `${at}/spent`, issues);
  });
}

const fail = (issues: AssignmentIssue[], code?: AssignmentCode): AssignmentValidation<never> => ({ ok: false, ...(code ? { code } : {}), issues });
const idIssue = (issues: AssignmentIssue[]) => issues.some((i) => i.pointer === "/assignment_id");

const hasDuplicate = (entries: readonly unknown[]): boolean => {
  const seen = new Set<string>();
  for (const e of entries) {
    const c = (e as { currency: string }).currency;
    if (seen.has(c)) return true;
    seen.add(c);
  }
  return false;
};

/** The id agrees with the episode reference: case, step and n (README section 11). */
function idAgreesWithEpisode(id: string, episodeRef: string): ParsedAssignmentId | undefined {
  const parsed = parseAssignmentId(id);
  const episode = parseEpisodeRef(episodeRef);
  if (!parsed || !episode) return undefined;
  return parsed.caseId === episode.caseId && parsed.stepId === episode.planItemId && parsed.n === episode.n ? parsed : undefined;
}

/** Validate an `Assignment` payload: the schema, then the semantic rules of README section 11. */
export function validateAssignment(value: unknown): AssignmentValidation<Assignment> {
  if (!isObj(value)) return fail([{ pointer: "", message: "must be an object" }]);
  const issues: AssignmentIssue[] = [];
  checkKeys(value, "", ASSIGNMENT_REQUIRED, ASSIGNMENT_REQUIRED, issues);
  if ("assignment_id" in value) checkAssignmentId(value.assignment_id, "/assignment_id", issues);
  for (const key of ["case_id", "step_id"]) {
    if (key in value && !(typeof value[key] === "string" && TOKEN_PATTERN.test(value[key] as string))) issues.push({ pointer: `/${key}`, message: `does not match ${TOKEN_PATTERN.source}` });
  }
  for (const key of ["n", "k"]) {
    if (key in value && !(Number.isInteger(value[key]) && (value[key] as number) >= 1)) issues.push({ pointer: `/${key}`, message: "is less than the minimum of 1 or not an integer" });
  }
  if ("episode_ref" in value) checkEpisodeRef(value.episode_ref, "/episode_ref", issues);
  if ("brief" in value) checkBrief(value.brief, "/brief", issues);
  if ("budget" in value) checkBudget(value.budget, "/budget", issues);
  if ("issued_at" in value) checkTimestamp(value.issued_at, "/issued_at", issues);
  if (issues.length) return fail(issues, idIssue(issues) ? "ASSIGNMENT_ID_INVALID" : undefined);

  const a = value as unknown as Assignment;
  const parsed = idAgreesWithEpisode(a.assignment_id, a.episode_ref);
  if (!parsed) return fail([{ pointer: "/assignment_id", message: "case, step and n of the id must equal those of episode_ref" }], "ASSIGNMENT_ID_INVALID");
  if (a.case_id !== parsed.caseId || a.step_id !== parsed.stepId || a.n !== parsed.n || a.k !== parsed.k) {
    return fail([{ pointer: "", message: "case_id, step_id, n and k must repeat the assignment id" }], "ASSIGNMENT_ID_INVALID");
  }
  if (hasDuplicate(a.budget)) return fail([{ pointer: "/budget", message: "a currency appears twice" }], "ASSIGNMENT_BUDGET_INVALID");
  return { ok: true, value: a };
}

/** Validate an `Event` payload (one lifecycle event): the schema, then the semantic rules. */
export function validateAssignmentEvent(value: unknown): AssignmentValidation<AssignmentEvent> {
  if (!isObj(value)) return fail([{ pointer: "", message: "must be an object" }]);
  const issues: AssignmentIssue[] = [];
  checkKeys(value, "", EVENT_REQUIRED, [...EVENT_REQUIRED, "reason"], issues);
  if ("assignment_id" in value) checkAssignmentId(value.assignment_id, "/assignment_id", issues);
  if ("episode_ref" in value) checkEpisodeRef(value.episode_ref, "/episode_ref", issues);
  if ("event" in value && !EVENT_NAMES.includes(value.event as AssignmentEventName)) issues.push({ pointer: "/event", message: `is not one of ${JSON.stringify(EVENT_NAMES)}` });
  if ("at" in value) checkTimestamp(value.at, "/at", issues);
  if ("spend" in value) checkSpend(value.spend, "/spend", issues);
  if ("reason" in value) checkText(value.reason, "/reason", issues);
  if (REASON_REQUIRED.includes(value.event as string) && !("reason" in value)) issues.push({ pointer: "", message: '"reason" is a required property' });
  if (issues.length) return fail(issues, idIssue(issues) ? "ASSIGNMENT_ID_INVALID" : undefined);

  const e = value as unknown as AssignmentEvent;
  if (!idAgreesWithEpisode(e.assignment_id, e.episode_ref)) return fail([{ pointer: "/assignment_id", message: "case, step and n of the id must equal those of episode_ref" }], "ASSIGNMENT_ID_INVALID");
  if (hasDuplicate(e.spend)) return fail([{ pointer: "/spend", message: "a currency appears twice" }], "ASSIGNMENT_BUDGET_INVALID");
  return { ok: true, value: e };
}

/** Validate the `Error` def (a refusal carrying one of the six codes). */
export function validateAssignmentError(value: unknown): AssignmentValidation<{ readonly outcome: "refused"; readonly code: AssignmentCode; readonly message: string }> {
  if (!isObj(value)) return fail([{ pointer: "", message: "must be an object" }]);
  const issues: AssignmentIssue[] = [];
  checkKeys(value, "", ERROR_REQUIRED, ERROR_REQUIRED, issues);
  if ("outcome" in value && value.outcome !== "refused") issues.push({ pointer: "/outcome", message: 'was expected to be "refused"' });
  if ("code" in value && !ASSIGNMENT_CODES.includes(value.code as AssignmentCode)) issues.push({ pointer: "/code", message: `is not one of ${JSON.stringify(ASSIGNMENT_CODES)}` });
  if ("message" in value) checkText(value.message, "/message", issues);
  return issues.length ? fail(issues) : { ok: true, value: value as never };
}

// ── budget and spend ───────────────────────────────────────────────────────────────────────────────────────

export interface BudgetBreach {
  readonly currency: Currency;
  readonly limit: number;
  readonly spent: number;
}

/** Numeric spend above a numeric limit. An unknown limit or unknown spend never trips it (README section 11). */
export function budgetBreaches(budget: readonly BudgetEntry[], spend: readonly SpendEntry[]): BudgetBreach[] {
  const out: BudgetBreach[] = [];
  for (const s of spend) {
    const limit = budget.find((b) => b.currency === s.currency)?.limit;
    if (typeof s.spent === "number" && typeof limit === "number" && s.spent > limit) out.push({ currency: s.currency, limit, spent: s.spent });
  }
  return out;
}

/** A spend vector with every currency at `value` (the five entries the contract requires, in currency order). */
export const spendOf = (value: number | "unknown"): SpendEntry[] => CURRENCIES.map((currency) => ({ currency, spent: value }));

/**
 * Add one reported amount to a cumulative spend vector. A numeric delta adds to a numeric total; an `unknown` delta, or
 * a total that is already `unknown`, leaves the currency `unknown` (an unmeasured amount is never counted as 0).
 */
export function addSpend(spend: readonly SpendEntry[], currency: Currency, delta: number | "unknown"): SpendEntry[] {
  return spend.map((s) => (s.currency !== currency ? s : { currency, spent: delta === "unknown" || s.spent === "unknown" ? "unknown" : s.spent + delta }));
}

// ── lifecycle ──────────────────────────────────────────────────────────────────────────────────────────────

/** The sequence so far: the id and episode it is bound to, and the last event. `undefined` status before `issued`. */
export interface AssignmentLifecycle {
  readonly assignmentId: string;
  readonly episodeRef: string;
  readonly status?: AssignmentEventName;
}
export interface LifecycleContext {
  /** The budget of the assignment; enables ASSIGNMENT_BUDGET_EXCEEDED. */
  readonly budget?: readonly BudgetEntry[];
  /** `expires_at` of the delegation link; a `resumed` after it is ASSIGNMENT_LINK_EXPIRED. */
  readonly linkExpiresAt?: string;
}
export type LifecycleResult =
  | { readonly ok: true; readonly state: AssignmentLifecycle }
  | { readonly ok: false; readonly code: AssignmentCode; readonly message: string };

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);
export const isTerminalAssignmentEvent = (event: string | undefined): boolean => event !== undefined && TERMINAL.has(event);

/** The state machine table: issued -> started -> (interrupted <-> resumed)* -> completed | failed | cancelled; an interrupted one may be cancelled. */
const NEXT: Readonly<Record<string, readonly string[]>> = {
  none: ["issued"],
  issued: ["started"],
  started: ["interrupted", "completed", "failed", "cancelled"],
  resumed: ["interrupted", "completed", "failed", "cancelled"],
  interrupted: ["resumed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
export const nextAssignmentEvents = (status: AssignmentEventName | undefined): readonly string[] => NEXT[status ?? "none"] ?? [];

/**
 * Apply one event to the sequence. Pure: the same inputs give the same result. `state` is `undefined` before the first
 * event, which binds the sequence to its id and episode. Checks run in the contract's order: id, episode, transition,
 * link expiry, duplicate currency, budget.
 */
export function stepAssignment(state: AssignmentLifecycle | undefined, event: AssignmentEvent, context: LifecycleContext = {}): LifecycleResult {
  const bound = state ?? { assignmentId: event.assignment_id, episodeRef: event.episode_ref };
  const refuse = (code: AssignmentCode, message: string): LifecycleResult => ({ ok: false, code, message });
  if (event.assignment_id !== bound.assignmentId) return refuse("ASSIGNMENT_ID_INVALID", `event carries ${event.assignment_id}, the sequence is ${bound.assignmentId}`);
  if (event.episode_ref !== bound.episodeRef) return refuse("ASSIGNMENT_EPISODE_CHANGED", `event names ${event.episode_ref}, the sequence is bound to ${bound.episodeRef}`);
  if (!nextAssignmentEvents(state?.status).includes(event.event)) return refuse("ASSIGNMENT_TRANSITION_INVALID", `${event.event} is not allowed after ${state?.status ?? "the start of the sequence"}`);
  if (event.event === "resumed" && context.linkExpiresAt !== undefined && Date.parse(event.at) > Date.parse(context.linkExpiresAt)) {
    return refuse("ASSIGNMENT_LINK_EXPIRED", `resume at ${event.at} is after the delegation link expired at ${context.linkExpiresAt}`);
  }
  if (hasDuplicate(event.spend)) return refuse("ASSIGNMENT_BUDGET_INVALID", "a currency appears twice in spend");
  if (context.budget) {
    const [breach] = budgetBreaches(context.budget, event.spend);
    if (breach) return refuse("ASSIGNMENT_BUDGET_EXCEEDED", `${breach.currency} spent ${breach.spent} is above the limit ${breach.limit}`);
  }
  return { ok: true, state: { assignmentId: bound.assignmentId, episodeRef: bound.episodeRef, status: event.event } };
}

/** Run a whole sequence; the first refusal wins. An empty sequence is ok and leaves no state. */
export function runAssignmentLifecycle(events: readonly AssignmentEvent[], context: LifecycleContext = {}): LifecycleResult | { readonly ok: true; readonly state: undefined } {
  let state: AssignmentLifecycle | undefined;
  for (const event of events) {
    const result = stepAssignment(state, event, context);
    if (!result.ok) return result;
    state = result.state;
  }
  return { ok: true, state };
}

// ── refusal as a service error ─────────────────────────────────────────────────────────────────────────────

const SERVICE_CODE: Readonly<Record<AssignmentCode, ServiceErrorCode>> = {
  ASSIGNMENT_ID_INVALID: "invalid_argument",
  ASSIGNMENT_BUDGET_INVALID: "invalid_argument",
  ASSIGNMENT_EPISODE_CHANGED: "invalid_argument",
  ASSIGNMENT_TRANSITION_INVALID: "failed_precondition",
  ASSIGNMENT_LINK_EXPIRED: "failed_precondition",
  ASSIGNMENT_BUDGET_EXCEEDED: "failed_precondition",
};

/** A refusal carrying one of the contract's codes exactly; the message starts with the code so it survives any transport. */
export class AssignmentRefusedError extends ServiceError {
  readonly assignmentCode: AssignmentCode;
  constructor(code: AssignmentCode, detail: string) {
    super(SERVICE_CODE[code], `${code}: ${detail}`);
    this.assignmentCode = code;
  }
}
