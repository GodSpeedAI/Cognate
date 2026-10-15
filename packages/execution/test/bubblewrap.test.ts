import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PathEscapeError } from "../src/types.ts";
import { bubblewrapExecutionWorld } from "../src/bubblewrap.ts";

const runtimeRoots = ["/usr/bin", "/usr/lib", "/lib", "/lib64"];
const runOsTests = process.env.COGNATE_BWRAP_TESTS === "1";
type BubblewrapTestAttestation = {
  readonly executablePath: string;
  readonly provenance: {
    readonly operatorVerified: true;
    readonly binarySha256: string;
    readonly version: string;
    readonly source: string;
    readonly patchedCve202687766: true;
  };
};

async function readOsAttestation(): Promise<BubblewrapTestAttestation | undefined> {
  if (!runOsTests) return undefined;
  const raw = process.env.COGNATE_BWRAP_TEST_ATTESTATION;
  if (!raw) {
    throw new Error("COGNATE_BWRAP_TESTS=1 requires COGNATE_BWRAP_TEST_ATTESTATION to name a host-owned JSON file with reviewed executable provenance; installed versions are not trusted automatically");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(raw, "utf8"));
  } catch {
    throw new Error("COGNATE_BWRAP_TEST_ATTESTATION must name a readable file containing valid JSON");
  }
  if (!value || typeof value !== "object") throw new Error("COGNATE_BWRAP_TEST_ATTESTATION must be a JSON object");
  const candidate = value as Partial<BubblewrapTestAttestation>;
  const proof = candidate.provenance;
  if (typeof candidate.executablePath !== "string" || candidate.executablePath.trim().length === 0 ||
      !proof || proof.operatorVerified !== true || proof.patchedCve202687766 !== true ||
      !/^[a-f0-9]{64}$/.test(proof.binarySha256) || typeof proof.version !== "string" || proof.version.trim().length === 0 ||
      typeof proof.source !== "string" || proof.source.trim().length === 0) {
    throw new Error("COGNATE_BWRAP_TEST_ATTESTATION must include executablePath and reviewed provenance (operatorVerified, patchedCve202687766, binarySha256, version, source)");
  }
  return candidate as BubblewrapTestAttestation;
}

const osAttestation = await readOsAttestation();
// Unit-only placeholder: these tests fail on invalid configuration before resolving or launching
// this executable. It is not evidence of a patched binary and must never enter an OS test fixture.
const unitOnlyProvenance = {
  operatorVerified: true as const,
  binarySha256: "a".repeat(64),
  version: "unit-only-placeholder",
  source: "non-OS invalid-configuration test only",
  patchedCve202687766: true as const,
};
const osWorldOptions = (workspaceRoot: string, worldId = "bwrap-os-test") => {
  if (!osAttestation) throw new Error("OS bubblewrap tests require COGNATE_BWRAP_TEST_ATTESTATION");
  return {
    worldId,
    workspaceRoot,
    executablePath: osAttestation.executablePath,
    provenance: osAttestation.provenance,
    runtimeRoots,
  };
};

describe("bubblewrap execution-world contract", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });
  const world = async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-"));
    roots.push(root);
    return {
      root,
      provider: await bubblewrapExecutionWorld(osWorldOptions(root, "bwrap-test")),
    };
  };

  test("requires operator-verified executable provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-"));
    roots.push(root);
    await expect(bubblewrapExecutionWorld({
      workspaceRoot: root,
      executablePath: "/nonexistent/unit-only-bubblewrap",
      provenance: { ...unitOnlyProvenance, operatorVerified: false },
      runtimeRoots,
    } as never)).rejects.toThrow(/operator-verified/);
  });

  test("requires explicit runtime roots and rejects host-root mounts", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-"));
    roots.push(root);
    await expect(bubblewrapExecutionWorld({
      workspaceRoot: root,
      executablePath: "/nonexistent/unit-only-bubblewrap",
      provenance: unitOnlyProvenance,
      runtimeRoots: ["/"],
    })).rejects.toThrow(/runtime root/);
  });

  test("rejects a runtime root that overlaps the writable workspace", async () => {
    await expect(bubblewrapExecutionWorld({
      workspaceRoot: "/usr/lib",
      executablePath: "/usr/bin/true",
      provenance: unitOnlyProvenance,
      runtimeRoots: ["/usr/lib"],
    })).rejects.toThrow("Runtime root and writable workspace must not overlap");
  });

  test("rejects a launcher inside the writable workspace before executing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-"));
    roots.push(root);
    const marker = join(tmpdir(), `cognate-bwrap-launched-${crypto.randomUUID()}`);
    const launcher = join(root, "bwrap");
    const contents = `#!/bin/sh\nprintf launched > '${marker}'\nexit 1\n`;
    await writeFile(launcher, contents);
    await chmod(launcher, 0o755);
    const binarySha256 = createHash("sha256").update(contents).digest("hex");
    await expect(bubblewrapExecutionWorld({
      workspaceRoot: root,
      executablePath: launcher,
      provenance: { ...unitOnlyProvenance, binarySha256 },
      runtimeRoots,
    })).rejects.toThrow("launcher must be outside the writable workspace");
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });

  test("rejects a Bun runtime file inside the writable workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-"));
    roots.push(root);
    const bunExecutable = join(root, "bun");
    await writeFile(bunExecutable, "unit placeholder");
    await expect(bubblewrapExecutionWorld({
      workspaceRoot: root,
      executablePath: "/usr/bin/true",
      provenance: unitOnlyProvenance,
      runtimeRoots,
      bunExecutable,
    })).rejects.toThrow("Bun executable must be outside the writable workspace");
  });

  test.skipIf(!runOsTests)("filesystem rejects symlink traversal outside the workspace", async () => {
    const { root, provider } = await world();
    const outside = await mkdtemp(join(tmpdir(), "cognate-bwrap-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "secret.txt"), "host secret");
    await symlink(outside, join(root, "escape"));
    expect(() => provider.fileSystem.resolve(root, "escape/secret.txt")).toThrow(PathEscapeError);
    await expect(provider.fileSystem.readText(join(root, "escape/secret.txt"))).rejects.toThrow(PathEscapeError);
  });

  test.skipIf(!runOsTests)("filesystem writes only through workspace-contained paths", async () => {
    const { root, provider } = await world();
    const outside = await mkdtemp(join(tmpdir(), "cognate-bwrap-outside-"));
    roots.push(outside);
    const target = join(outside, "sentinel.txt");
    await writeFile(target, "untouched");
    await symlink(target, join(root, "escape.txt"));
    await expect(provider.fileSystem.writeText(join(root, "escape.txt"), "changed")).rejects.toThrow(PathEscapeError);
    expect(await readFile(target, "utf8")).toBe("untouched");
    const allowed=provider.fileSystem.resolve(root,"normal.txt");
    await provider.fileSystem.writeText(allowed,"native filesystem receipt");
    expect(await provider.fileSystem.readText(allowed)).toBe("native filesystem receipt");
    expect((await provider.fileSystem.stat(allowed))?.kind).toBe("file");
    expect((await provider.fileSystem.list(root)).some(entry=>entry.name==="normal.txt")).toBe(true);
  });
});

describe("bubblewrap OS containment (explicit privileged integration gate)", () => {
  test.skipIf(!runOsTests)("runs argv inside workspace-only writable namespace with no inherited env or host home", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-os-"));
    try {
      const provider = await bubblewrapExecutionWorld(osWorldOptions(root));
      await expect(provider.process.exec({argv:["/usr/bin/true"],cwd:root,env:{COGNATE_SECRET:"must-not-cross"}})).rejects.toThrow("not allowed");
      const result = await provider.process.exec({
        argv: ["/usr/bin/bash", "-lc", "printf '%s|%s' \"${COGNATE_SECRET-unset}\" \"$(pwd)\"; touch /workspace/wrote.txt; test ! -r /tmp/host-only-secret"],
        cwd: root,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("unset|/workspace");
      expect(await Bun.file(join(root, "wrote.txt")).exists()).toBe(true);
      await provider.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.skipIf(!runOsTests)("denies networking and prevents workspace symlinks from writing outside", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-os-"));
    const outside = await mkdtemp(join(tmpdir(), "cognate-bwrap-outside-"));
    try {
      const sentinel = join(outside, "sentinel");
      await writeFile(sentinel, "unchanged");
      await symlink(sentinel, join(root, "escape"));
      const provider = await bubblewrapExecutionWorld(osWorldOptions(root));
      const write = await provider.process.exec({ argv: ["/usr/bin/touch", "/workspace/escape"], cwd: root });
      expect(write.exitCode).not.toBe(0);
      expect(await readFile(sentinel, "utf8")).toBe("unchanged");
      const host=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response("host listener")});
      try{
        expect(await (await fetch(`http://127.0.0.1:${host.port}`)).text()).toBe("host listener");
        const network = await provider.process.exec({ argv: ["/usr/bin/bash", "-c", `echo > /dev/tcp/127.0.0.1/${host.port}`], cwd: root, timeoutMs: 1_000 });
        expect(network.exitCode).not.toBe(0);
      }finally{host.stop(true);}
      await provider.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test.skipIf(!runOsTests)("timeout kills the sandbox process tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-bwrap-os-"));
    try {
      const provider = await bubblewrapExecutionWorld(osWorldOptions(root));
      const result = await provider.process.exec({
        argv: ["/usr/bin/bash", "-lc", "(sleep 1; touch /workspace/child-survived) & wait"],
        cwd: root,
        timeoutMs: 100,
      });
      expect(result.timedOut).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(await Bun.file(join(root, "child-survived")).exists()).toBe(false);
      await provider.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.skipIf(!runOsTests)("nested Bun children cannot read host secrets, create namespaces or survive cancellation",async()=>{
    const root=await mkdtemp(join(tmpdir(),"cognate-bwrap-bun-"));
    const outside=await mkdtemp(join(tmpdir(),"cognate-bwrap-secret-"));
    try{
      const secret=join(outside,"secret");await writeFile(secret,"not exposed");
      const provider=await bubblewrapExecutionWorld({...osWorldOptions(root),bunExecutable:process.execPath});
      const code=`const p=Bun.spawn(["/usr/bin/bash","-c",${JSON.stringify(`set -e; test ! -r '${secret}'; test ! -r /proc/1/root${secret}; touch /workspace/nested-proof`)}],{stdout:"pipe",stderr:"pipe"});process.exit(await p.exited);`;
      const result=await provider.process.exec({argv:["bun","-e",code],cwd:root});
      expect(result.exitCode,result.stderr).toBe(0);
      expect(await Bun.file(join(root,"nested-proof")).exists()).toBe(true);
      const privileged=await provider.process.exec({argv:["/usr/bin/unshare","--user","/usr/bin/true"],cwd:root});
      expect(privileged.exitCode).not.toBe(0);
      const abort=new AbortController();
      const pending=provider.process.exec({argv:["/usr/bin/bash","-c","touch /workspace/started; (sleep 1; touch /workspace/escaped-cancel) & wait"],cwd:root},{signal:abort.signal});
      for(let i=0;i<100 && !await Bun.file(join(root,"started")).exists();i++)await Bun.sleep(5);
      expect(await Bun.file(join(root,"started")).exists()).toBe(true);
      abort.abort();await expect(pending).rejects.toThrow("cancelled");
      await Bun.sleep(1100);
      expect(await Bun.file(join(root,"escaped-cancel")).exists()).toBe(false);
      await provider.dispose();
      await expect(provider.process.exec({argv:["/usr/bin/true"],cwd:root})).rejects.toThrow("disposed");
    }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
  });

  test.skipIf(!runOsTests)("bounded output terminates the child and changed binary provenance fails closed",async()=>{
    const root=await mkdtemp(join(tmpdir(),"cognate-bwrap-output-"));
    try{
      const provider=await bubblewrapExecutionWorld({...osWorldOptions(root),maxOutputBytes:1024});
      await expect(provider.process.exec({argv:["/usr/bin/yes"],cwd:root})).rejects.toThrow("output limit");
      await provider.dispose();
      await expect(bubblewrapExecutionWorld({...osWorldOptions(root),provenance:{...osAttestation!.provenance,binarySha256:"0".repeat(64)}})).rejects.toThrow("changed");
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
