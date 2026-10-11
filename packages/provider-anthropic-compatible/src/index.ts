import { ModelProviderError, type ModelRequest, type ModelResponse, type ModelProvider, type ModelDelta, type ToolCall } from "@godspeedai/cognate-capabilities";
import { credentialHeaders, type CredentialSource } from "@godspeedai/cognate-provider-auth";
import { sendJson, readSSE, requestSignal } from "@godspeedai/cognate-provider-wire";

export interface AnthropicCompatibleOptions {
  readonly id: string;
  readonly baseURL: string;
  readonly model: string;
  readonly credentials: CredentialSource;
  readonly anthropicVersion?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly contextLimit?: number;
}
function wire(options:AnthropicCompatibleOptions,request:ModelRequest,stream:boolean):Record<string,unknown> {
  if(request.responseFormat) throw new ModelProviderError("invalid_request","native Anthropic Messages JSON-schema output is not implemented");
  const system=request.messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
  const messages:Record<string,unknown>[]=[];
  for(const m of request.messages) {
    if(m.role==="system") continue;
    if(m.role==="tool") {
      if(!m.toolCallId) throw new ModelProviderError("invalid_request","tool result missing call ID");
      messages.push({role:"user",content:[{type:"tool_result",tool_use_id:m.toolCallId,content:m.content}]});continue;
    }
    const blocks:Record<string,unknown>[]=[];
    if(m.content) blocks.push({type:"text",text:m.content});
    if(m.role==="assistant") for(const call of m.toolCalls??[]) blocks.push({type:"tool_use",id:call.id,name:call.name,input:call.arguments});
    messages.push({role:m.role,content:blocks});
  }
  const out:Record<string,unknown>={model:options.model,messages,max_tokens:request.maxTokens??1024,stream};
  if(system) out.system=system;
  if(request.tools?.length) out.tools=request.tools.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema}));
  if(request.temperature!==undefined) out.temperature=request.temperature;
  return out;
}
function finalResponse(raw:any,fallbackModel:string):ModelResponse {
  if(raw?.type!=="message" || !Array.isArray(raw.content)) throw new ModelProviderError("malformed_response","missing Anthropic message content");
  const toolCalls:ToolCall[]=[];
  const text:string[]=[];
  for(const block of raw.content) {
    if(block.type==="text") text.push(block.text??"");
    if(block.type==="tool_use") toolCalls.push({id:block.id,name:block.name,arguments:block.input??{}});
  }
  const reason:ModelResponse["finishReason"]=raw.stop_reason==="max_tokens"?"length":raw.stop_reason==="tool_use"?"tool_calls":raw.stop_reason==="end_turn"||raw.stop_reason==="stop_sequence"?"stop":"error";
  return {message:{role:"assistant",content:text.join("")},toolCalls,finishReason:reason,model:raw.model??fallbackModel,
    ...(raw.usage?{usage:{inputTokens:raw.usage.input_tokens??0,outputTokens:raw.usage.output_tokens??0}}:{})};
}
export function anthropicCompatible(options:AnthropicCompatibleOptions):ModelProvider {
  const fetchFn=options.fetch??fetch;
  async function post(request:ModelRequest,stream:boolean,signal?:AbortSignal):Promise<Response> {
    const s=requestSignal(signal,options.timeoutMs);
    const credentials=await credentialHeaders(options.credentials,s);
    return sendJson(`${options.baseURL.replace(/\/$/,"")}/messages`,wire(options,request,stream),
      {"anthropic-version":options.anthropicVersion??"2023-06-01",...credentials},fetchFn,s);
  }
  return {
    id:`anthropic-messages:${options.id}`,model:options.model,
    features:{generate:true,stream:true,tool_use:true,structured_output:false,multimodal_input:false,context_limit:options.contextLimit??200000},
    async generate(request,signal) {
      const response=await post(request,false,signal);
      let raw:unknown;
      try{raw=await response.json();}catch{throw new ModelProviderError("malformed_response","invalid Anthropic message JSON");}
      return finalResponse(raw,options.model);
    },
    async *stream(request,signal):AsyncIterable<ModelDelta> {
      const response=await post(request,true,signal);
      const parts=new Map<number, {type:string;id?:string;name?:string;text:string;args:string;input?:unknown}>();
      let model=options.model, stopReason:string|undefined, usage:{inputTokens:number;outputTokens:number}|undefined;
      let sawStop=false;
      for await(const event of readSSE(response)) {
        let data:any;
        try{data=JSON.parse(event.data);}catch{throw new ModelProviderError("malformed_response","invalid Anthropic event");}
        const type=data.type??event.event;
        if(type==="error") throw new ModelProviderError("unavailable","Anthropic streaming error");
        if(type==="message_start") {
          if(data.message?.model) model=data.message.model;
          usage={inputTokens:data.message?.usage?.input_tokens??0,outputTokens:data.message?.usage?.output_tokens??0};
        }
        if(type==="content_block_start"){
          const b=data.content_block??{};
          parts.set(data.index,{type:b.type,id:b.id,name:b.name,text:b.type==="text"?(b.text??""):"",args:"",input:b.input});
          if(b.type==="tool_use") yield {type:"tool_call_start",callId:b.id,name:b.name};
          if(b.type==="text" && b.text) yield {type:"text",text:b.text};
        }
        if(type==="content_block_delta") {
          const p=parts.get(data.index);
          if(!p) throw new ModelProviderError("malformed_response","delta without content block");
          if(data.delta?.type==="text_delta") {p.text+=data.delta.text??"";yield {type:"text",text:data.delta.text??""};}
          if(data.delta?.type==="input_json_delta") {const delta=data.delta.partial_json??"";p.args+=delta;yield {type:"tool_call_args",callId:p.id??"",delta};}
        }
        if(type==="content_block_stop") {
          const p=parts.get(data.index);
          if(p?.type==="tool_use" && p.id) yield {type:"tool_call_end",callId:p.id};
        }
        if(type==="message_delta") {
          if(data.delta?.stop_reason) stopReason=data.delta.stop_reason;
          if(data.usage?.output_tokens!==undefined) usage={inputTokens:usage?.inputTokens??0,outputTokens:data.usage.output_tokens};
        }
        if(type==="message_stop") {sawStop=true;break;}
      }
      if(!sawStop) throw new ModelProviderError("malformed_response","stream ended before message_stop");
      const content:string[]=[];const toolCalls:ToolCall[]=[];
      for(const [,p] of [...parts.entries()].sort(([a],[b])=>a-b)) {
        if(p.type==="text") content.push(p.text);
        if(p.type==="tool_use"){
          let args:unknown=p.input??{};
          if(p.args){try{args=JSON.parse(p.args);}catch{throw new ModelProviderError("malformed_response","invalid tool JSON");}}
          const call={id:p.id??"",name:p.name??"",arguments:args as ToolCall["arguments"]};
          toolCalls.push(call);yield {type:"tool_call",call};
        }
      }
      const finishReason:ModelResponse["finishReason"]=stopReason==="max_tokens"?"length":stopReason==="tool_use"?"tool_calls":stopReason==="end_turn"||stopReason==="stop_sequence"?"stop":"error";
      yield {type:"done",response:{message:{role:"assistant",content:content.join("")},toolCalls,finishReason,model,...(usage?{usage}:{})}};
    },
  };
}
