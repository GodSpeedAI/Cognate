import { test, expect } from "bun:test";
import { openAIResponses } from "../src/index.ts";
import { apiKeySource } from "@godspeedai/cognate-provider-auth";

const completed={status:"completed",model:"m",output:[{type:"message",content:[{type:"output_text",text:"Hello"}]}],usage:{input_tokens:3,output_tokens:2}};
test("nonstream Responses uses store:false and parses completed settlement",async()=>{
  let captured:any;
  const provider=openAIResponses({id:"fixture",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"key"),fetch:async(url,init)=>{captured={url,init};return Response.json(completed);}});
  const result=await provider.generate({messages:[{role:"user",content:"hi"}]});
  expect(result.message.content).toBe("Hello");
  expect(captured.url).toBe("https://example.test/v1/responses");
  expect(JSON.parse(captured.init.body)).toMatchObject({model:"m",store:false,stream:false});
});
test("stream cannot settle before response.completed",async()=>{
  const stream= new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n'));c.close();}});
  const provider=openAIResponses({id:"fixture",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"k"),fetch:async()=>new Response(stream)});
  await expect((async()=>{for await(const _ of provider.stream({messages:[{role:"user",content:"hi"}]})){} })()).rejects.toThrow();
});
test("completed stream yields final done",async()=>{
  const body='event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\nevent: response.completed\ndata: '+JSON.stringify({type:"response.completed",response:completed})+'\n\n';
  const provider=openAIResponses({id:"fixture",baseURL:"https://example.test/v1",model:"m",credentials:apiKeySource(()=>"k"),fetch:async()=>new Response(body)});
  const events=[];for await(const event of provider.stream({messages:[{role:"user",content:"hi"}]})) events.push(event);
  expect(events.at(-1)).toMatchObject({type:"done",response:{message:{content:"Hello"}}});
});
