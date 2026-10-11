import { expect, test } from "bun:test";
import { typeSafeProvider } from "../src/index.ts";
import { apiKeySource } from "@godspeedai/cognate-provider-auth";

test("System One uses native typed questions, idempotency and no chat proxy", async () => {
  let sent: {url:string; init:RequestInit}|undefined;
  const provider = typeSafeProvider({ id:"test",baseURL:"https://fixture.test/v1",model:"jev-latest",credentials:apiKeySource(()=> "never-log"),
    fetch: async (url,init) => {
      sent={url:String(url),init:init!};
      return Response.json({model:"jev-resolved",answers:{route:{type:"choice",choice:"build",probabilities:{build:0.8,wait:0.2},confidence:0.6}},usage:{input_tokens:18,output_tokens:0}});
    }
  });
  const r = await provider.evaluate({state:{problem:"test"},questions:{route:{type:"choice",instructions:"Choose",criteria:{build:"Do it",wait:"Delay"}}},operationKey:"settlement-1"});
  expect(sent?.url).toBe("https://fixture.test/v1/systemone");
  expect(sent?.init.headers).toMatchObject({"idempotency-key":"settlement-1",authorization:"Bearer never-log"});
  expect(JSON.parse(String(sent?.init.body))).toMatchObject({state:{problem:"test"},model:"jev-latest",questions:{route:{type:"choice"}}});
  expect(r).toMatchObject({model:"jev-resolved",answers:{route:{choice:"build",confidence:0.6}}});
});
test("rejects nonsensical judgments before payable calls",async ()=>{
  const provider=typeSafeProvider({id:"test",baseURL:"https://fixture",model:"m",credentials:apiKeySource(()=>"k"),fetch: async()=>{throw Error("should not call");}});
  await expect(provider.evaluate({state:"s",questions:{x:{type:"score",instructions:"Bad",criteria:["one"]}}})).rejects.toThrow("2-10");
});
