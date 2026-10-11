import { ModelProviderError } from "@godspeedai/cognate-capabilities";
export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function requestSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  return timeoutMs !== undefined ? AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]) : signal;
}
export function httpError(status: number): ModelProviderError {
  const kind = status===401 || status===403 ? "unauthorized" : status===429 ? "rate_limited" : status>=400 && status<500 ? "invalid_request" : "unavailable";
  // Do not echo opaque upstream error text: it may contain tokens or user payload.
  return new ModelProviderError(kind,`model upstream HTTP ${status}`,status);
}
export async function sendJson(url: string, body: unknown, headers: Record<string,string>, fetchFn: HttpFetch, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try { response = await fetchFn(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body),signal}); }
  catch { throw new ModelProviderError(signal?.aborted?"cancelled":"unavailable","model request aborted or unavailable"); }
  if (!response.ok) throw httpError(response.status);
  return response;
}
export interface SSEEvent { readonly event: string; readonly data: string; }
/** UTF-8 SSE framing across arbitrary chunk boundaries; ignores comments, never executes content. */
export async function* readSSE(response: Response): AsyncIterable<SSEEvent> {
  if (!response.body) throw new ModelProviderError("malformed_response","missing event stream");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer="";
  function decode(frame: string): SSEEvent | undefined {
    let event="", data: string[]=[];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event=line.slice(6).trimStart();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    return data.length?{event,data:data.join("\n")}:undefined;
  }
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (value) buffer += decoder.decode(value,{stream:true});
      if (done) buffer += decoder.decode();
      let match: RegExpExecArray | null;
      while ((match=/\r?\n\r?\n/.exec(buffer))) {
        const frame=buffer.slice(0,match.index);
        buffer=buffer.slice(match.index+match[0].length);
        const parsed=decode(frame);
        if (parsed) yield parsed;
      }
      if (done) {
        const last=decode(buffer);
        if(last) yield last;
        return;
      }
    }
  } catch {
    throw new ModelProviderError("unavailable","model event stream interrupted");
  } finally { reader.releaseLock(); }
}
