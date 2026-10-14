import { describe, expect, test } from "bun:test";
import type { AgentDefinition, Caller, RunView } from "@godspeedai/cognate-runtime-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRuntime, type RuntimeOptions } from "../src/index.ts";

const caller: Caller = {tenant:"test",actor:{id:"human",kind:"user"}};
const policy = {authorize:()=>({allow:true as const,policyId:"test",reason:"test"})};
const actions = {authorize:()=>({allow:true as const,reason:"test"})};

describe("bounded independent native runs", () => {
  for (const capacity of [1, 2]) test(`run and continuation claims share capacity ${capacity}`, async () => {
    const store = openSqliteStore({ path: ":memory:" });
    const claimed = new Set<string>();
    const deliveries = new Map<string, number>();
    let peakClaims = 0, active = 0, peakExecution = 0;
    const claim = store.claimOutboxLeased!.bind(store);
    const settle = store.settleOutboxLease!.bind(store);
    store.claimOutboxLeased = async input => {
      const items = await claim(input);
      for (const item of items) {
        claimed.add(item.id);
        deliveries.set(item.id, (deliveries.get(item.id) ?? 0) + 1);
      }
      peakClaims = Math.max(peakClaims, claimed.size);
      return items;
    };
    store.settleOutboxLease = async (input, outcome) => {
      const result = await settle(input, outcome);
      if (result) claimed.delete(input.id);
      return result;
    };
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const agent: AgentDefinition = { id: "agent.mixed", version: "1.0.0", async run(input, ctx) {
      if ((input as { wait?: boolean }).wait) await ctx.waitFor("resume", { type: "test", condition: { kind: "test" }, payload: null });
      return ctx.step("work", async () => {
        active++; peakExecution = Math.max(peakExecution, active);
        try { await gate; return input; } finally { active--; }
      });
    } };
    const runtime = await createRuntime({ store: { store }, agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: capacity, resourceKeys: () => [] } });
    try {
      await Promise.all(Array.from({ length: capacity }, (_, i) => runtime.service.startRun(caller,
        { agent: agent.id, input: { wait: true }, idempotencyKey: `waiting:${i}` })));
      await runtime.idle();
      await Promise.all(Array.from({ length: capacity }, (_, i) => runtime.service.startRun(caller,
        { agent: agent.id, input: { blocking: i }, idempotencyKey: `blocking:${i}` })));
      for (let i = 0; active < capacity && i < 100; i++) await Bun.sleep(5);
      expect(active).toBe(capacity);
      const waits = await runtime.service.listContinuations(caller, { status: "OPEN" });
      await Promise.all(waits.map(wait => runtime.service.resolveContinuation(caller,
        { continuationId: wait.id, action: "resume", input: null, idempotencyKey: `mixed:${wait.id}` })));
      await runtime.service.startRun(caller, { agent: agent.id, input: { queued: true }, idempotencyKey: "queued" });
      await Bun.sleep(50);
      expect(peakClaims).toBeLessThanOrEqual(capacity);
      release();
      await runtime.idle();
      expect(peakExecution).toBe(capacity);
      expect(claimed.size).toBe(0);
      expect([...deliveries.values()].every(count => count === 1)).toBe(true);
      expect((await store.listOutbox({ status: "delivered" })).some(item => item.topic === "continuation.resume")).toBe(true);
    } finally { release(); await runtime.close(); await store.close(); }
  });
  for (const capacity of [1,2,4,8]) test(`capacity ${capacity} preserves run-local output and limits overlap`, async () => {
    let active=0, peak=0;
    const agent: AgentDefinition = {id:"agent.slow",version:"1.0.0",async run(input,ctx){
      return ctx.step("slow",async()=>{
        active++;peak=Math.max(peak,active);
        try{await Bun.sleep(40);return {input,actor:ctx.actor.id};}finally{active--;}
      });
    }};
    const runtime=await createRuntime({store:":memory:",agents:[agent],policy,actions,
      execution:{maxConcurrentRuns:capacity,resourceKeys:()=>[]}} as RuntimeOptions);
    try{
      const runs=await Promise.all(Array.from({length:8},(_,i)=>runtime.service.startRun(caller,{agent:agent.id,input:{i},idempotencyKey:`run:${i}`})));
      await runtime.idle();
      expect(peak).toBe(capacity);
      for(let i=0;i<runs.length;i++)expect((await runtime.service.getRun(caller,{runId:runs[i]!.runId})).output).toEqual({input:{i},actor:"human"});
    }finally{await runtime.close();}
  });

  test("conflicting resource keys serialize while independent work overlaps",async()=>{
    const active=new Set<string>();let peak=0;let conflicts=0;
    const agent:AgentDefinition={id:"agent.resource",version:"1.0.0",async run(input,ctx){return ctx.step("effect",async()=>{
      const key=(input as {workspace:string}).workspace;
      if(active.has(key))conflicts++;
      active.add(key);peak=Math.max(peak,active.size);
      try{await Bun.sleep(50);return {key};}finally{active.delete(key);}
    });}};
    const runtime=await createRuntime({store:":memory:",agents:[agent],policy,actions,
      execution:{maxConcurrentRuns:4,resourceKeys:(run:RunView)=>[(run.input as {workspace:string}).workspace]}} as RuntimeOptions);
    try{
      await Promise.all(["shared","shared","independent"].map((workspace,i)=>runtime.service.startRun(caller,{agent:agent.id,input:{workspace},idempotencyKey:`resource:${i}`})));
      await runtime.idle();expect(conflicts).toBe(0);expect(peak).toBe(2);
    }finally{await runtime.close();}
  });

  test("invalid capacity fails before opening resources",async()=>{
    for(const maxConcurrentRuns of [0,-1,1.5,NaN,65]){
      await expect(createRuntime({store:":memory:",agents:[],policy,actions,execution:{maxConcurrentRuns}} as RuntimeOptions)).rejects.toThrow("maxConcurrentRuns");
    }
    await expect(createRuntime({store:":memory:",agents:[],policy,actions,execution:{maxConcurrentRuns:2}})).rejects.toThrow("eligibility policy");
    for(const store of [{},{claimOutboxLeased:async()=>[]}]){
      await expect(createRuntime({store:{store:store as never},agents:[],policy,actions,execution:{maxConcurrentRuns:2,resourceKeys:()=>[]}})).rejects.toThrow("complete fenced outbox");
    }
  });

  test("cancelling one overlapping capability does not cancel another tenant or cross its output",async()=>{
    let started=0;
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const agent:AgentDefinition={id:"agent.invoke",version:"1.0.0",run:(_,ctx)=>ctx.invoke("slow",{owner:ctx.actor.id})};
    const runtime=await createRuntime({store:":memory:",agents:[agent],policy,actions,execution:{maxConcurrentRuns:2,resourceKeys:()=>[]},components:[{
      id:"slow",provides:[{id:"slow",version:"1.0.0"}],activate(fiber){fiber.provide({id:"slow",version:"1.0.0"},async(input,ctx)=>{
        started++;await gate;return {input,tenant:ctx.tenant,actor:ctx.actor.id};
      });},
    }]});
    try{
      const other:Caller={tenant:"other",actor:{id:"other-human",kind:"user"}};
      const a=await runtime.service.startRun(caller,{agent:agent.id,input:null,idempotencyKey:"cancel-a"});
      const b=await runtime.service.startRun(other,{agent:agent.id,input:null,idempotencyKey:"keep-b"});
      for(let i=0;started<2 && i<100;i++)await Bun.sleep(5);
      expect(started).toBe(2);
      await runtime.service.cancelRun(caller,{runId:a.runId,reason:"test",idempotencyKey:"cancel"});
      release();
      await runtime.idle();
      expect((await runtime.service.getRun(caller,{runId:a.runId})).status).toBe("cancelled");
      expect((await runtime.service.getRun(other,{runId:b.runId})).output).toEqual({input:{owner:"other-human"},tenant:"other",actor:"other-human"});
    }finally{release();await runtime.close();}
  });

  test("PostgreSQL execution overlaps at capacity two with durable distinct outputs",async()=>{
    const store=await openPostgresStore({url:process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",schema:`cognate_parallel_${crypto.randomUUID().replaceAll("-","")}`,pollMs:0});
    let active=0,peak=0;
    const agent:AgentDefinition={id:"agent.postgres",version:"1.0.0",async run(input,ctx){return ctx.step("slow",async()=>{
      active++;peak=Math.max(peak,active);try{await Bun.sleep(80);return input;}finally{active--;}
    });}};
    const runtime=await createRuntime({store:{store:store.store},agents:[agent],policy,actions,execution:{maxConcurrentRuns:2,resourceKeys:()=>[]}});
    try{
      const runs=await Promise.all([1,2,3,4].map(i=>runtime.service.startRun(caller,{agent:agent.id,input:{i},idempotencyKey:`pg:${i}`})));
      await runtime.idle();expect(peak).toBe(2);
      for(let i=0;i<runs.length;i++)expect((await runtime.service.getRun(caller,{runId:runs[i]!.runId})).output).toEqual({i:i+1});
    }finally{await runtime.close();await store.dropSchema();await store.close();}
  });

  test("resumed runs overlap without replaying steps before their independent continuations",async()=>{
    let before=0,active=0,peak=0;
    const agent:AgentDefinition={id:"agent.wait",version:"1.0.0",async run(input,ctx){
      await ctx.step("before",()=>{before++;return input;});
      const result=await ctx.waitFor("resume",{type:"test",condition:{kind:"test"},payload:input});
      return ctx.step("after",async()=>{
        active++;peak=Math.max(peak,active);try{await Bun.sleep(50);return {input,result};}finally{active--;}
      });
    }};
    const runtime=await createRuntime({store:":memory:",agents:[agent],policy,actions,execution:{maxConcurrentRuns:2,resourceKeys:()=>[]}});
    try{
      const runs=await Promise.all([1,2].map(i=>runtime.service.startRun(caller,{agent:agent.id,input:{i},idempotencyKey:`wait:${i}`})));
      await runtime.idle();
      const waits=await runtime.service.listContinuations(caller,{status:"OPEN"});
      expect(waits).toHaveLength(2);
      await Promise.all(waits.map(wait=>runtime.service.resolveContinuation(caller,{continuationId:wait.id,action:"resume",input:{for:wait.runId},idempotencyKey:`resume:${wait.id}`})));
      await runtime.idle();expect(before).toBe(2);expect(peak).toBe(2);
      for(let i=0;i<runs.length;i++)expect((await runtime.service.getRun(caller,{runId:runs[i]!.runId})).output).toEqual({input:{i:i+1},result:{for:runs[i]!.runId}});
    }finally{await runtime.close();}
  });
});
