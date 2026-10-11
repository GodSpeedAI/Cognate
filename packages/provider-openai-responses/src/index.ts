import { ModelProviderError, type ModelRequest, type ModelResponse, type ModelProvider, type ModelDelta, type ToolCall } from "@godspeedai/cognate-capabilities";
import { credentialHeaders, assertSubscriptionUse, type CredentialSource, type SubscriptionGrant, type UsageMode } from "@godspeedai/cognate-provider-auth";
import { sendJson, readSSE, requestSignal, type HttpFetch } from "@godspeedai/cognate-provider-wire";

export interface OpenAIResponsesOptions {
  readonly id: string;
  readonly baseURL: string;
  readonly model: string;
  readonly credentials: CredentialSource;
  readonly fetch?: HttpFetch;
  readonly timeoutMs?: number;
  /** When plan-backed, require an explicit usage-mode resolver on every request. */
  readonly subscription?: { readonly grant: SubscriptionGrant; readonly usageMode: () => UsageMode };
}
function wireInput(request: ModelRequest): unknown[] {
  return request.messages.flatMap(message => {
    if (message.role === "tool") return [{type:"function_call_output",call_id:message.toolCallId,output:message.content}];
    const item: Record<string,unknown>={role:message.role,content:message.content};
    const calls = message.toolCalls?.map(call=>({type:"function_call",call_id:call.id,name:call.name,arguments:JSON.stringify(call.arguments)})) ?? [];
    return [item,...calls];
  });
}
function body(options:OpenAIResponsesOptions,request:ModelRequest,stream:boolean):Record<string,unknown> {
  const out:Record<string,unknown>={model:options.model,input:wireInput(request),stream,store:false};
  if(request.instructions) out.instructions=request.instructions;
  if(request.tools?.length) out.tools=request.tools.map(t=>({type:"function",name:t.name,description:t.description,parameters:t.inputSchema}));
  if(request.maxTokens!==undefined) out.max_output_tokens=request.maxTokens;
  if(request.temperature!==undefined) out.temperature=request.temperature;
  if(request.responseFormat) out.text={format:request.responseFormat.schema?{type:"json_schema",name:"response",schema:request.responseFormat.schema}:{type:"json_object"}};
  return out;
}
function result(raw: unknown, fallbackModel:string):ModelResponse {
  const r=raw as {status?:string;model?:string;output?:Array<any>;usage?:{input_tokens?:number;output_tokens?:number};incomplete_details?:unknown};
  if(r?.status!=="completed"||!Array.isArray(r.output)) throw new ModelProviderError("malformed_response","Responses API did not confirm response.completed");
  const toolCalls:ToolCall[]=[];
  const text:string[]=[];
  for(const item of r.output) {
    if(item.type==="function_call") {
      let args:unknown;
      try { args=JSON.parse(item.arguments??"{}"); } catch { throw new ModelProviderError("malformed_response","invalid response function arguments"); }
      toolCalls.push({id:item.call_id,name:item.name,arguments:args as ToolCall["arguments"]});
    }
    if(item.type==="message") for(const content of item.content??[]) if(content.type==="output_text") text.push(content.text??"");
  }
  return { message:{role:"assistant",content:text.join("")},toolCalls,finishReason:toolCalls.length?"tool_calls":"stop",model:r.model??fallbackModel,
    ...(r.usage?{usage:{inputTokens:r.usage.input_tokens??0,outputTokens:r.usage.output_tokens??0}}:{})};
}
export function openAIResponses(options:OpenAIResponsesOptions):ModelProvider {
  const fetchFn=options.fetch??fetch;
  async function post(request:ModelRequest, stream:boolean, signal?:AbortSignal):Promise<Response> {
    if(options.subscription) assertSubscriptionUse(options.subscription.grant,options.subscription.usageMode());
    const s=requestSignal(signal,options.timeoutMs);
    const headers=await credentialHeaders(options.credentials,s);
    return sendJson(`${options.baseURL.replace(/\/$/,"")}/responses`,body(options,request,stream),headers,fetchFn,s);
  }
  return {
    id:`openai-responses:${options.id}`,model:options.model,
    features:{generate:true,stream:true,tool_use:true,structured_output:true,multimodal_input:false,context_limit:128000},
    async generate(request,signal) {
      const response=await post(request,false,signal);
      let raw:unknown;
      try {raw=await response.json();}catch{throw new ModelProviderError("malformed_response","invalid Responses JSON");}
      return result(raw,options.model);
    },
    async *stream(request,signal):AsyncIterable<ModelDelta> {
      const response=await post(request,true,signal);
      let completed=false;
      let yieldedText=false;
      for await(const event of readSSE(response,signal)) {
        if(event.data==="[DONE]") break;
        let payload:any;
        try {payload=JSON.parse(event.data);} catch {throw new ModelProviderError("malformed_response","invalid Responses event JSON");}
        const type=payload.type??event.event;
        if(type==="response.output_text.delta" && typeof payload.delta==="string") {yieldedText=true;yield {type:"text",text:payload.delta};}
        if(type==="response.failed"||type==="error"||type==="response.incomplete") throw new ModelProviderError("unavailable","Responses did not complete");
        if(type==="response.completed") {
          const final=result(payload.response,options.model);
          completed=true;
          if(!yieldedText && final.message.content) yield {type:"text",text:final.message.content};
          for(const call of final.toolCalls) yield {type:"tool_call",call};
          yield {type:"done",response:final};
          return;
        }
      }
      if(!completed) throw new ModelProviderError("malformed_response","stream ended before response.completed");
    },
  };
}
