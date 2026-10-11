import { expect, test } from "bun:test";
import { anthropicCompatible } from "../src/index.ts";
import { apiKeySource } from "@godspeedai/cognate-provider-auth";

test("native Anthropic Messages headers, system, tool input schema and response mapping",async()=>{
  let sent:any;
  const provider=anthropicCompatible({id:"t",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"test-key","x-api-key"),fetch:async(url,init)=>{sent={url,init};return Response.json({type:"message",model:"m",content:[{type:"text",text:"Done"}],stop_reason:"end_turn",usage:{input_tokens:5,output_tokens:2}});}});
  const response=await provider.generate({messages:[{role:"system",content:"Be careful"},{role:"user",content:"hi"}],tools:[{name:"lookup",description:"Lookup",inputSchema:{type:"object"}}]});
  expect(response.message.content).toBe("Done");
  expect(sent.url).toBe("https://example.test/v1/messages");
  expect(sent.init.headers).toMatchObject({"x-api-key":"test-key","anthropic-version":"2023-06-01"});
  expect(JSON.parse(sent.init.body)).toMatchObject({system:"Be careful",max_tokens:1024,tools:[{name:"lookup",input_schema:{type:"object"}}]});
});
test("stream settles only at message_stop",async()=>{
  const payload=[
    {type:"message_start",message:{model:"m",usage:{input_tokens:1,output_tokens:0}}},
    {type:"content_block_start",index:0,content_block:{type:"text",text:""}},
    {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Hello"}},
    {type:"content_block_stop",index:0},
    {type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:2}},
    {type:"message_stop"}
  ].map(x=>`event: ${x.type}\ndata: ${JSON.stringify(x)}\n\n`).join("");
  const p=anthropicCompatible({id:"t",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"k","x-api-key"),fetch:async()=>new Response(payload)});
  const events=[];for await(const e of p.stream({messages:[{role:"user",content:"hi"}]}))events.push(e);
  expect(events.at(-1)).toMatchObject({type:"done",response:{message:{content:"Hello"},finishReason:"stop"}});
});
