import type { JudgmentProvider, JudgmentRequest, JudgmentResponse, JudgmentQuestion, JudgmentAnswer } from "@godspeedai/cognate-capabilities";
import type { CredentialSource } from "@godspeedai/cognate-provider-auth";
import { credentialHeaders } from "@godspeedai/cognate-provider-auth";

export interface TypeSafeOptions {
  readonly id: string;
  /** Origin or /v1 URL, e.g. https://api.typesafe.ai or https://system-one.dev/v1. */
  readonly baseURL: string;
  readonly model: string;
  readonly credentials: CredentialSource;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}
function isRecord(v: unknown): v is Record<string,unknown> { return !!v && typeof v==="object" && !Array.isArray(v); }
function validate(request: JudgmentRequest): void {
  const questions = Object.entries(request.questions);
  if (request.state === null || !["string","object"].includes(typeof request.state)) throw new Error("judgment: invalid state");
  if (!questions.length || questions.length > 32) throw new Error("judgment: questions must contain 1-32 items");
  for (const [id,question] of questions) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(id) || !question.instructions.trim()) throw new Error("judgment: invalid question identity/instructions");
    if (question.type === "choice" && Object.keys(question.criteria).length < 2) throw new Error("judgment: choice needs at least two options");
    if (question.type === "score" && (question.criteria.length < 2 || question.criteria.length > 10)) throw new Error("judgment: score needs 2-10 levels");
  }
}
function validatedAnswers(raw: unknown, requested: JudgmentRequest["questions"]): Record<string,JudgmentAnswer> {
  if (!isRecord(raw)) throw new Error("judgment: missing answer map");
  const answers: Record<string,JudgmentAnswer> = {};
  for (const [id,q] of Object.entries(requested)) {
    const a = raw[id];
    if (!isRecord(a) || a.type !== q.type) throw new Error(`judgment: missing or mismatched answer for ${id}`);
    if (q.type==="choice") {
      if (typeof a.choice !== "string" || !Object.hasOwn(q.criteria,a.choice)) throw new Error(`judgment: invalid choice for ${id}`);
      answers[id]={ type:"choice", choice:a.choice, ...(isRecord(a.probabilities)? {probabilities:a.probabilities as Record<string,number>} : {}), ...(typeof a.confidence==="number"?{confidence:a.confidence}:{}) };
    } else if (q.type==="score") {
      if (typeof a.score !== "number" || !Number.isFinite(a.score) || a.score<0 || a.score>q.criteria.length-1) throw new Error(`judgment: invalid score for ${id}`);
      answers[id]={type:"score",score:a.score,...(isRecord(a.probabilities)? {probabilities:a.probabilities as Record<string,number>} : {}),...(typeof a.confidence==="number"?{confidence:a.confidence}:{})};
    } else {
      if (typeof a.noul !== "number" || !Number.isFinite(a.noul) || a.noul<0 || a.noul>1) throw new Error(`judgment: invalid probability for ${id}`);
      answers[id]={type:"noul",noul:a.noul,...(typeof a.confidence==="number"?{confidence:a.confidence}:{})};
    }
  }
  return answers;
}
export function typeSafeProvider(options: TypeSafeOptions): JudgmentProvider {
  const url = `${options.baseURL.replace(/\/$/,"").replace(/\/v1$/,"")}/v1/systemone`;
  return {
    id: `typesafe:${options.id}`, model: options.model,
    async evaluate(request: JudgmentRequest, signal?: AbortSignal): Promise<JudgmentResponse> {
      validate(request);
      const abort = options.timeoutMs ? AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs)]) : signal;
      const headers = { "content-type":"application/json", ...(await credentialHeaders(options.credentials,signal)), ...(request.operationKey?{"idempotency-key":request.operationKey}:{}) };
      const body = JSON.stringify({model:options.model,state:request.state,questions:request.questions});
      let response: Response;
      try { response = await (options.fetch??fetch)(url,{method:"POST",headers,body,signal:abort}); }
      catch { throw new Error("judgment: request unavailable or cancelled"); }
      if (!response.ok) throw new Error(`judgment: upstream HTTP ${response.status}`);
      let raw: unknown;
      try { raw=await response.json(); } catch { throw new Error("judgment: malformed JSON response"); }
      if (!isRecord(raw)||!isRecord(raw.answers)||typeof raw.model!=="string") throw new Error("judgment: malformed decision response");
      const usage = isRecord(raw.usage) ? {
        ...(typeof raw.usage.input_tokens==="number" ? {inputTokens:raw.usage.input_tokens}:{}),
        ...(typeof raw.usage.output_tokens==="number" ? {outputTokens:raw.usage.output_tokens}:{})
      } : undefined;
      return {model:raw.model,answers:validatedAnswers(raw.answers,request.questions),...(usage?{usage}:{})};
    }
  };
}
