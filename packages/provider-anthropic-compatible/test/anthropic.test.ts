import { expect, test } from "bun:test";
import { anthropicCompatible } from "../src/index.ts";
import { apiKeySource } from "@godspeedai/cognate-provider-auth";

const provider=(fetch:Parameters<typeof anthropicCompatible>[0]["fetch"])=>anthropicCompatible({id:"t",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"test-key","x-api-key"),fetch});
const sse=(events:readonly{type:string;[k:string]:unknown}[]):string=>events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const byteChunks=(body:string):Response=>new Response(new ReadableStream({start(c){for(const b of new TextEncoder().encode(body))c.enqueue(new Uint8Array([b]));c.close();}}));
async function drain(stream:AsyncIterable<unknown>):Promise<unknown[]>{const out:unknown[]=[];for await(const e of stream)out.push(e);return out;}

test("native Anthropic Messages headers, system, tool input schema and response mapping",async()=>{
  let sent:any;
  const p=provider(async(url,init)=>{sent={url,init};return Response.json({type:"message",model:"m",content:[{type:"text",text:"Done"}],stop_reason:"end_turn",usage:{input_tokens:5,output_tokens:2}});});
  const response=await p.generate({messages:[{role:"system",content:"Be careful"},{role:"user",content:"hi"}],tools:[{name:"lookup",description:"Lookup",inputSchema:{type:"object"}}]});
  expect(response.message.content).toBe("Done");
  expect(response.usage).toEqual({inputTokens:5,outputTokens:2});
  expect(sent.url).toBe("https://example.test/v1/messages");
  expect(sent.init.headers).toMatchObject({"x-api-key":"test-key","anthropic-version":"2023-06-01"});
  expect(JSON.parse(sent.init.body)).toMatchObject({system:"Be careful",max_tokens:1024,tools:[{name:"lookup",input_schema:{type:"object"}}]});
});
test("conversation feedback maps assistant tool_use and tool results to native blocks",async()=>{
  let sent:any;
  const p=provider(async(url,init)=>{sent={url,init};return Response.json({type:"message",model:"m",content:[{type:"text",text:"ok"}],stop_reason:"end_turn"});});
  await p.generate({messages:[
    {role:"assistant",content:"calling",toolCalls:[{id:"tu_1",name:"lookup",arguments:{q:"x"}}]},
    {role:"tool",toolCallId:"tu_1",content:"the result"},
  ]});
  const body=JSON.parse(sent.init.body);
  expect(body.messages).toEqual([
    {role:"assistant",content:[{type:"text",text:"calling"},{type:"tool_use",id:"tu_1",name:"lookup",input:{q:"x"}}]},
    {role:"user",content:[{type:"tool_result",tool_use_id:"tu_1",content:"the result"}]},
  ]);
});
test("tool result without a call id is an invalid request before any payable call",async()=>{
  const p=provider(async()=>Response.json({type:"message",content:[],stop_reason:"end_turn"}));
  await expect(p.generate({messages:[{role:"tool",content:"orphan"}]})).rejects.toMatchObject({kind:"invalid_request"});
});
test("structured output is honestly refused, matching declared features",async()=>{
  const p=provider(async()=>Response.json({type:"message",content:[],stop_reason:"end_turn"}));
  expect(p.features.structured_output).toBe(false);
  await expect(p.generate({messages:[{role:"user",content:"hi"}],responseFormat:{type:"json"}})).rejects.toMatchObject({kind:"invalid_request"});
});
test("stop reasons map honestly: length, tool_calls, refusal; unknown stays error",async()=>{
  const stop=async(stop_reason:string)=>{
    const p=provider(async()=>Response.json({type:"message",model:"m",content:[{type:"text",text:"x"}],stop_reason}));
    return (await p.generate({messages:[{role:"user",content:"hi"}]})).finishReason;
  };
  expect(await stop("max_tokens")).toBe("length");
  expect(await stop("tool_use")).toBe("tool_calls");
  expect(await stop("stop_sequence")).toBe("stop");
  expect(await stop("refusal")).toBe("content_filter");
  expect(await stop("pause_turn")).toBe("error");
});
test("stream settles only at message_stop",async()=>{
  const payload=sse([
    {type:"message_start",message:{model:"claude-x",usage:{input_tokens:1,output_tokens:0}}},
    {type:"content_block_start",index:0,content_block:{type:"text",text:""}},
    {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Hello"}},
    {type:"content_block_stop",index:0},
    {type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:2}},
    {type:"message_stop"},
  ]);
  const p=provider(async()=>byteChunks(payload));
  const events=await drain(p.stream({messages:[{role:"user",content:"hi"}]}));
  const done=events.at(-1) as {type:string;response:{model:string;usage?:{inputTokens:number;outputTokens:number}}};
  expect(done).toMatchObject({type:"done",response:{message:{content:"Hello"},finishReason:"stop"}});
  expect(done.response.model).toBe("claude-x");
  expect(done.response.usage).toEqual({inputTokens:1,outputTokens:2});
});
test("tool_use streams emit start, args deltas across byte boundaries, end, then a settled call",async()=>{
  const payload=sse([
    {type:"message_start",message:{model:"m",usage:{input_tokens:1,output_tokens:0}}},
    {type:"content_block_start",index:0,content_block:{type:"tool_use",id:"tu_1",name:"lookup",input:{}}},
    {type:"content_block_delta",index:0,delta:{type:"input_json_delta",partial_json:'{"q":'}},
    {type:"content_block_delta",index:0,delta:{type:"input_json_delta",partial_json:'"x"}'}},
    {type:"content_block_stop",index:0},
    {type:"message_delta",delta:{stop_reason:"tool_use"},usage:{output_tokens:3}},
    {type:"message_stop"},
  ]);
  const p=provider(async()=>byteChunks(payload));
  const events=await drain(p.stream({messages:[{role:"user",content:"hi"}]}));
  expect(events).toMatchObject([
    {type:"tool_call_start",callId:"tu_1",name:"lookup"},
    {type:"tool_call_args",callId:"tu_1",delta:'{"q":'},
    {type:"tool_call_args",callId:"tu_1",delta:'"x"}'},
    {type:"tool_call_end",callId:"tu_1"},
    {type:"tool_call",call:{id:"tu_1",name:"lookup",arguments:{q:"x"}}},
    {type:"done",response:{finishReason:"tool_calls",toolCalls:[{id:"tu_1",name:"lookup",arguments:{q:"x"}}]}},
  ]);
});
test("a stream that ends before message_stop never settles",async()=>{
  const p=provider(async()=>new Response(sse([{type:"message_start",message:{model:"m"}},{type:"content_block_start",index:0,content_block:{type:"text",text:"partial"}}])));
  await expect((async()=>{for await(const _ of p.stream({messages:[{role:"user",content:"hi"}]})){}})()).rejects.toMatchObject({kind:"malformed_response"});
});
test("error events and malformed JSON mid-stream throw; caller abort surfaces as cancelled",async()=>{
  const p=provider(async()=>new Response(sse([{type:"error",error:{type:"overloaded_error",message:"Overloaded"}}])));
  await expect((async()=>{for await(const _ of p.stream({messages:[{role:"user",content:"hi"}]})){}})()).rejects.toMatchObject({kind:"unavailable"});

  const broken=provider(async()=>new Response("{not json"));
  await expect(broken.generate({messages:[{role:"user",content:"hi"}]})).rejects.toMatchObject({kind:"malformed_response"});

  const controller=new AbortController();
  const aborting=provider(async()=>new Response(new ReadableStream({start(c){
    c.enqueue(new TextEncoder().encode(sse([
      {type:"message_start",message:{model:"m"}},
      {type:"content_block_start",index:0,content_block:{type:"text",text:""}},
      {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"par"}},
    ])));
    controller.signal.addEventListener("abort",()=>c.error(new DOMException("aborted","AbortError")));
  }})));
  const consume=(async()=>{for await(const delta of aborting.stream({messages:[{role:"user",content:"hi"}]},controller.signal)){if(delta.type==="text")controller.abort();}})();
  await expect(consume).rejects.toMatchObject({kind:"cancelled"});
});
test("HTTP failures classify without echoing upstream text",async()=>{
  const e401=await provider(async()=>new Response('{"error":{"message":"invalid x-api-key test-key"}}',{status:401})).generate({messages:[{role:"user",content:"hi"}]}).catch(e=>e);
  expect(e401).toMatchObject({kind:"unauthorized",status:401});
  expect((e401 as Error).message).not.toContain("test-key");
  const e429=await provider(async()=>new Response("{}",{status:429})).generate({messages:[{role:"user",content:"hi"}]}).catch(e=>e);
  expect(e429).toMatchObject({kind:"rate_limited",status:429});
});
