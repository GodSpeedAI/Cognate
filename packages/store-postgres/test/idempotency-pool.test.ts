import { expect,test } from "bun:test";
import { openPostgresStore } from "../src/index.ts";
import type { CommitRequest } from "@godspeedai/cognate-events";

test("same-key replay stays on its transaction connection under saturated PostgreSQL pool",async()=>{
  const handle=await openPostgresStore({url:process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",schema:`cognate_pool_${crypto.randomUUID().replaceAll("-","")}`,maxConnections:2,pollMs:0});
  const request:CommitRequest={idempotency:{scope:"pool-test",key:"same-key",fingerprint:"same-input"},appends:[{streamId:"pool-stream",expectedVersion:0,events:[{eventType:"pool.test",schemaVersion:1,occurredAt:new Date().toISOString(),tenant:"test",correlationId:"pool",causationId:null,runId:null,scopeId:"root",payload:{proof:true}}]}]};
  let timer:ReturnType<typeof setTimeout>|undefined;
  const commits=Promise.all(Array.from({length:20},()=>handle.store.commit(request)));
  try{
    const outcomes=await Promise.race([commits,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Saturated idempotency replay deadlocked")),3000);})]);
    expect(outcomes.filter(outcome=>outcome.kind==="committed")).toHaveLength(1);
    expect(outcomes.filter(outcome=>outcome.kind==="duplicate")).toHaveLength(19);
    const events=await handle.store.readAll();expect(events).toHaveLength(1);
    expect(outcomes.every(outcome=>outcome.events[0]?.eventId===events[0]?.eventId)).toBe(true);
    const following=await handle.store.commit({...request,idempotency:{...request.idempotency!,key:"following-key"},appends:[{...request.appends![0]!,streamId:"following-stream"}]});
    expect(following.events[0]?.position).toBe(2);
  }finally{
    if(timer)clearTimeout(timer);
    await handle.close();
    await commits.catch(()=>{});
    await handle.dropSchema();
  }
},10000);
