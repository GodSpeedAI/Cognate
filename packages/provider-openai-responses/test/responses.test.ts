import { test, expect } from "bun:test";
import { openAIResponses } from "../src/index.ts";
import { apiKeySource } from "@godspeedai/cognate-provider-auth";
import { ModelProviderError } from "@godspeedai/cognate-capabilities";

const completed={status:"completed",model:"m",output:[{type:"message",content:[{type:"output_text",text:"Hello"}]}],usage:{input_tokens:3,output_tokens:2}};
const provider=(fetch:Parameters<typeof openAIResponses>[0]["fetch"])=>openAIResponses({id:"fixture",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"key"),fetch});

async function drain(stream:AsyncIterable<unknown>):Promise<unknown[]>{const out:unknown[]=[];for await(const e of stream)out.push(e);return out;}
/** Splits a string into single-byte chunks to prove SSE framing survives arbitrary boundaries. */
const byteChunks=(body:string):Response=>new Response(new ReadableStream({start(c){for(const b of new TextEncoder().encode(body))c.enqueue(new Uint8Array([b]));c.close();}}));
const sseEvents=(events:readonly{type:string;[k:string]:unknown}[]):string=>events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

test("nonstream Responses uses store:false and parses completed settlement",async()=>{
  let captured:any;
  const p=provider(async(url,init)=>{captured={url,init};return Response.json(completed);});
  const result=await p.generate({messages:[{role:"user",content:"hi"}]});
  expect(result.message.content).toBe("Hello");
  expect(result.usage).toEqual({inputTokens:3,outputTokens:2});
  expect(result.model).toBe("m");
  expect(captured.url).toBe("https://example.test/v1/responses");
  expect(captured.init.headers.authorization).toBe("Bearer key");
  expect(JSON.parse(captured.init.body)).toMatchObject({model:"m",store:false,stream:false});
});
test("request body maps tools, tool feedback, limits and structured output per the Responses schema",async()=>{
  let captured:any;
  const p=provider(async(url,init)=>{captured={url,init};return Response.json(completed);});
  await p.generate({
    messages:[
      {role:"system",content:"be brief"},
      {role:"user",content:"hi"},
      {role:"assistant",content:"",toolCalls:[{id:"call_1",name:"lookup",arguments:{q:"x"}}]},
      {role:"tool",toolCallId:"call_1",content:"result"},
    ],
    tools:[{name:"lookup",description:"Lookup",inputSchema:{type:"object"}}],
    maxTokens:256,temperature:0.4,
    responseFormat:{type:"json",schema:{type:"object"}},
  });
  const body=JSON.parse(captured.init.body);
  expect(body.max_output_tokens).toBe(256);
  expect(body.temperature).toBe(0.4);
  expect(body.tools).toEqual([{type:"function",name:"lookup",description:"Lookup",parameters:{type:"object"}}]);
  expect(body.text).toEqual({format:{type:"json_schema",name:"response",schema:{type:"object"}}});
  expect(body.input).toEqual([
    {role:"system",content:"be brief"},
    {role:"user",content:"hi"},
    {role:"assistant",content:""},
    {type:"function_call",call_id:"call_1",name:"lookup",arguments:'{"q":"x"}'},
    {type:"function_call_output",call_id:"call_1",output:"result"},
  ]);
});
test("function_call output becomes typed tool calls with parsed arguments",async()=>{
  const p=provider(async()=>Response.json({...completed,output:[{type:"function_call",call_id:"call_9",name:"lookup",arguments:'{"q":"x"}'},{type:"message",content:[{type:"output_text",text:""}]}]}));
  const result=await p.generate({messages:[{role:"user",content:"hi"}]});
  expect(result.finishReason).toBe("tool_calls");
  expect(result.toolCalls).toEqual([{id:"call_9",name:"lookup",arguments:{q:"x"}}]);
});
test("unparseable function arguments are malformed, never silently objectified",async()=>{
  const p=provider(async()=>Response.json({...completed,output:[{type:"function_call",call_id:"c",name:"n",arguments:"{not json"}]}));
  await expect(p.generate({messages:[{role:"user",content:"hi"}]})).rejects.toMatchObject({kind:"malformed_response"});
});
test("non-completed status never settles successfully",async()=>{
  const variants:[string,unknown][]=[
    ["in_progress",{...completed,status:"in_progress"}],
    ["failed",{...completed,status:"failed"}],
    ["incomplete",{...completed,status:"incomplete"}],
    ["missing",{model:"m",output:[{type:"message",content:[{type:"output_text",text:"Hello"}]}]}],
  ];
  for(const [name,payload] of variants){
    const p=provider(async()=>Response.json(payload));
    await expect(p.generate({messages:[{role:"user",content:"hi"}]}),name).rejects.toMatchObject({kind:"malformed_response"});
  }
});
test("stream cannot settle before response.completed",async()=>{
  const stream= new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n'));c.close();}});
  const p=provider(async()=>new Response(stream));
  await expect((async()=>{for await(const _ of p.stream({messages:[{role:"user",content:"hi"}]})){} })()).rejects.toMatchObject({kind:"malformed_response"});
});
test("completed stream yields final done; failure events throw before settlement",async()=>{
  const body=sseEvents([{type:"response.output_text.delta",delta:"Hello"},{type:"response.completed",response:completed}]);
  const p=provider(async()=>byteChunks(body));
  const events=await drain(p.stream({messages:[{role:"user",content:"hi"}]}));
  expect(events.at(-1)).toMatchObject({type:"done",response:{message:{content:"Hello"}}});
  expect(events.filter(e=>(e as {type:string}).type==="text")).toEqual([{type:"text",text:"Hello"}]);

  for(const type of ["response.failed","error","response.incomplete"]){
    const failing=provider(async()=>new Response(sseEvents([{type,delta:"partial"}])));
    await expect((async()=>{for await(const _ of failing.stream({messages:[{role:"user",content:"hi"}]})){}})()).rejects.toMatchObject({kind:"unavailable"});
  }
});
test("[DONE] sentinel ends the stream without settling",async()=>{
  const body=sseEvents([{type:"response.output_text.delta",delta:"partial"}])+"event: done\ndata: [DONE]\n\n";
  const p=provider(async()=>new Response(body));
  await expect((async()=>{for await(const _ of p.stream({messages:[{role:"user",content:"hi"}]})){}})()).rejects.toMatchObject({kind:"malformed_response"});
});
test("HTTP failures classify and never echo the upstream body",async()=>{
  const e401=await provider(async()=>new Response('{"error":{"message":"bad key sk-secret"}}',{status:401})).generate({messages:[{role:"user",content:"hi"}]}).catch(e=>e);
  expect(e401).toMatchObject({kind:"unauthorized",status:401});
  expect((e401 as Error).message).not.toContain("sk-secret");
  const e429=await provider(async()=>new Response("{}",{status:429})).generate({messages:[{role:"user",content:"hi"}]}).catch(e=>e);
  expect(e429).toMatchObject({kind:"rate_limited",status:429});
});
test("caller abort during the stream surfaces as cancelled",async()=>{
  const controller=new AbortController();
  const p=provider(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(sseEvents([{type:"response.output_text.delta",delta:"par"}])));controller.signal.addEventListener("abort",()=>c.error(new DOMException("aborted","AbortError")));}})));
  const consume=(async()=>{for await(const _ of p.stream({messages:[{role:"user",content:"hi"}]},controller.signal)){controller.abort();}})();
  await expect(consume).rejects.toMatchObject({kind:"cancelled"});
});
test("invalid JSON settlement is malformed_response",async()=>{
  const p=provider(async()=>Response.json(completed));
  const broken=provider(async()=>new Response("{not json",{headers:{"content-type":"application/json"}}));
  await expect(broken.generate({messages:[{role:"user",content:"hi"}]})).rejects.toMatchObject({kind:"malformed_response"});
  expect(p.id).toBe("openai-responses:fixture");
});
