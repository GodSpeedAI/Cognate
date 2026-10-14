// Linux child-process containment behind the native execution-world ports. The host application
// remains trusted. This provider is opt-in and never falls back to local execution.
import { createHash } from "node:crypto";
import { realpathSync,statSync } from "node:fs";
import { readFile,realpath } from "node:fs/promises";
import { basename,dirname,resolve,sep } from "node:path";
import { commandFileSystem } from "./command.ts";
import { PathEscapeError,WorldUnavailableError,type ExecResult,type ExecSpec,type ExecutionWorldProvider,type FileSystemPort } from "./types.ts";

export interface BubblewrapExecutionWorldOptions {
  readonly worldId?:string;
  readonly workspaceRoot:string;
  readonly executablePath:string;
  /** Operator-controlled provenance, checked against the actual binary on every launch. */
  readonly provenance:{readonly operatorVerified:true;readonly binarySha256:string;readonly version:string;readonly source:string;readonly patchedCve202687766:true};
  /** Explicit public runtime directories. /, /home, /etc and arbitrary directory mounts are refused. */
  readonly runtimeRoots:readonly string[];
  /** Optional regular Bun executable, exposed at /opt/cognate/bin/bun. No containing home is mounted. */
  readonly bunExecutable?:string;
  readonly timeoutMs?:number;
  readonly maxOutputBytes?:number;
}
const PUBLIC_ROOTS=new Set(["/usr/bin","/usr/lib","/usr/lib64","/bin","/lib","/lib64"]);
const ENVIRONMENT=new Set(["LANG","LC_ALL","TZ","TERM"]);
const inside=(root:string,path:string)=>path===root || path.startsWith(root+sep);

export async function bubblewrapExecutionWorld(options:BubblewrapExecutionWorldOptions):Promise<ExecutionWorldProvider>{
  const worldId=options.worldId ?? "linux-bubblewrap";
  const unavailable=(reason:string):never=>{throw new WorldUnavailableError(worldId,reason);};
  if(process.platform!=="linux")unavailable("bubblewrap requires Linux namespaces; no local fallback is permitted");
  const proof=options.provenance;
  if(!proof?.operatorVerified || proof.patchedCve202687766!==true || !/^[a-f0-9]{64}$/.test(proof.binarySha256))unavailable("bubblewrap requires operator-verified patched binary provenance and SHA-256");
  if(!Array.isArray(options.runtimeRoots) || options.runtimeRoots.length===0 || options.runtimeRoots.some(path=>!PUBLIC_ROOTS.has(path)))unavailable("Invalid runtime root: only explicit public executable/library directories are supported");
  const executable=await realpath(options.executablePath);
  const workspace=await realpath(options.workspaceRoot);
  if(workspace==="/" || !statSync(workspace).isDirectory())unavailable("A dedicated workspace directory is required");
  const mounts: string[]=[];
  for(const root of [...new Set(options.runtimeRoots)]){
    let source:string;
    try{source=await realpath(root);}catch{continue;}
    if(inside(source,workspace) || inside(workspace,source))unavailable("Runtime root and writable workspace must not overlap");
    mounts.push("--ro-bind",source,root);
  }
  if(!mounts.length)unavailable("No usable runtime roots");
  const bunExecutable=options.bunExecutable ? await realpath(options.bunExecutable):undefined;
  if(bunExecutable && !statSync(bunExecutable).isFile())unavailable("Bun executable must be a regular file");
  const timeoutMs=options.timeoutMs ?? 30_000;
  const outputLimit=options.maxOutputBytes ?? 1_048_576;
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>300_000 || !Number.isSafeInteger(outputLimit) || outputLimit<1024 || outputLimit>16_777_216)unavailable("Invalid process resource limits");
  let disposed=false;
  const live=new Set<ReturnType<typeof Bun.spawn>>();
  const verifyBinary=async()=>{
    const digest=createHash("sha256").update(await readFile(executable)).digest("hex");
    if(digest!==proof.binarySha256)unavailable("bubblewrap executable changed since operator verification");
  };
  const toVirtual=(path:string):string=>{
    const absolute=resolve(path);
    if(inside(workspace,absolute))return "/workspace"+absolute.slice(workspace.length);
    if(inside("/workspace",absolute))return absolute;
    throw new PathEscapeError(path);
  };
  const assertHostPath=(path:string):string=>{
    const virtual=toVirtual(path);
    let probe=workspace+virtual.slice("/workspace".length);
    for(;;){
      try{const actual=realpathSync(probe);if(!inside(workspace,actual))throw new PathEscapeError(path);break;}
      catch(error){if(error instanceof PathEscapeError)throw error;const code=(error as {code?:string}).code;if(code!=="ENOENT" && code!=="ENOTDIR")throw error;const parent=dirname(probe);if(parent===probe)throw new PathEscapeError(path);probe=parent;}
    }
    return virtual;
  };
  const launch=async(spec:ExecSpec,signal?:AbortSignal):Promise<ExecResult>=>{
    if(disposed)unavailable("Execution world is disposed");
    if(signal?.aborted)throw new DOMException("Execution cancelled","AbortError");
    if(!spec.argv.length || spec.argv.some(arg=>typeof arg!=="string" || arg.includes("\0")))throw new Error("Invalid process argv");
    for(const key of Object.keys(spec.env ?? {}))if(!ENVIRONMENT.has(key))unavailable(`Environment variable is not allowed: ${key}`);
    await verifyBinary();
    const cwd=assertHostPath(spec.cwd);
    const args=[executable,"--unshare-all","--unshare-user","--disable-userns","--assert-userns-disabled","--new-session","--die-with-parent","--cap-drop","ALL","--clearenv",...mounts,
      "--tmpfs","/tmp","--proc","/proc","--dev","/dev","--dir","/opt/cognate/bin",
      ...(bunExecutable ? ["--ro-bind",bunExecutable,"/opt/cognate/bin/bun"]:[]),
      "--bind",workspace,"/workspace","--chdir",cwd,"--setenv","PATH","/opt/cognate/bin:/usr/bin:/bin","--setenv","HOME","/nonexistent",
      ...Object.entries(spec.env ?? {}).flatMap(([key,value])=>["--setenv",key,value]),"--",...spec.argv];
    const proc=Bun.spawn(args,{env:{},stdin:"ignore",stdout:"pipe",stderr:"pipe"});
    live.add(proc);
    let timedOut=false,overflow=false;
    const stop=()=>{try{proc.kill("SIGKILL");}catch{}};
    const limit=spec.timeoutMs===undefined ? timeoutMs:Math.min(timeoutMs,spec.timeoutMs);
    if(!Number.isSafeInteger(limit) || limit<1){stop();throw new Error("Invalid process timeout");}
    const timer=setTimeout(()=>{timedOut=true;stop();},limit);
    signal?.addEventListener("abort",stop,{once:true});
    if(signal?.aborted)stop();
    let size=0;
    const consume=async(stream:ReadableStream<Uint8Array>)=>{
      const chunks:Uint8Array[]=[];
      for await(const chunk of stream){size+=chunk.length;if(size>outputLimit){overflow=true;stop();break;}chunks.push(chunk);}
      return Buffer.concat(chunks).toString("utf8");
    };
    try{
      const [stdout,stderr]=await Promise.all([consume(proc.stdout as ReadableStream<Uint8Array>),consume(proc.stderr as ReadableStream<Uint8Array>)]);
      const exitCode=await proc.exited;
      if(signal?.aborted)throw new DOMException("Execution cancelled","AbortError");
      if(overflow)throw new Error("Execution output limit exceeded; sandbox terminated");
      return {stdout,stderr,exitCode,timedOut};
    }finally{clearTimeout(timer);signal?.removeEventListener("abort",stop);live.delete(proc);}
  };
  // All filesystem effects also execute in the namespace. Host path checks improve errors;
  // they are not the containment boundary and cannot remove all host-side TOCTOU races.
  const commandFs=commandFileSystem(script=>launch({argv:["/usr/bin/bash","-c",script],cwd:workspace}));
  commandFs.resolve("/workspace",".");
  const fileSystem:FileSystemPort={
    resolve(root,path){return assertHostPath(resolve(assertHostPath(root),path));},
    stat:async path=>commandFs.stat(assertHostPath(path)),exists:async path=>commandFs.exists(assertHostPath(path)),
    readText:async path=>commandFs.readText(assertHostPath(path)),list:async path=>commandFs.list(assertHostPath(path)),
    writeText:async(path,content)=>commandFs.writeText(assertHostPath(path),content),version:async path=>commandFs.version(assertHostPath(path)),
  };
  const probe=await launch({argv:["/usr/bin/true"],cwd:workspace,timeoutMs:5000});
  if(probe.exitCode!==0 || probe.timedOut)unavailable("bubblewrap namespace preflight failed: "+probe.stderr.slice(0,500));
  return {worldId,kind:"linux-bubblewrap",metadata:{containment:"linux-child-process-namespaces",network:"denied",workspace:basename(workspace),binarySha256:proof.binarySha256,resourceLimits:"wall-time-and-output-only"},fileSystem,
    process:{exec:(spec,execOptions)=>launch(spec,execOptions?.signal)},async dispose(){if(disposed)return;disposed=true;for(const proc of live){try{proc.kill("SIGKILL");}catch{}}await Promise.all([...live].map(proc=>proc.exited));}};
}
