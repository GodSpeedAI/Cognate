// Validate Cognate's single public GitHub release + individual npm package model.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync("release-please-config.json", "utf8"));
const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"));
const umbrella = "packages/cognate";
const paths = Object.keys(config.packages);
const errors = [];
if (!paths.includes(umbrella)) errors.push("umbrella packages/cognate missing");
// The umbrella must stay in component-in-tag mode: Release Please's linked-versions plugin
// silently drops any strategy whose getComponent() is falsy, and getComponent() is falsy
// whenever include-component-in-tag is false — so the "unified unprefixed tag" setting
// removed the umbrella from the group and the cognate_release_created publish gate never
// fired (observed: "Found 44 group components", 44/45 bumped, npm diverged from git).
// The release workflow owns the unified vX.Y.Z tag instead.
if (config.packages[umbrella]?.["include-component-in-tag"] !== true) errors.push("umbrella must keep include-component-in-tag: true — linked-versions drops component-less strategies and the publish gate never fires; the workflow moves the release onto the unified vX.Y.Z tag");
if (config.packages[umbrella]?.["skip-github-release"]) errors.push("umbrella must create the one GitHub Release");
for (const p of paths) {
  if (!Object.hasOwn(manifest,p)) errors.push(`Missing manifest path: ${p}`);
  if (p !== umbrella && config.packages[p]?.["skip-github-release"] !== true) errors.push(`Component GitHub release not disabled: ${p}`);
}
const actual = [...readdirSync("packages").map(d=>"packages/"+d),...readdirSync("profiles").map(d=>"profiles/"+d)].filter(p=>{try{return JSON.parse(readFileSync(join(p,"package.json"),"utf8")).private!==true;}catch{return false;}});
for(const p of actual) if(!paths.includes(p)) errors.push(`Publishable package unregistered: ${p}`);
const group = config.plugins?.find(p=>p.type==="linked-versions");
if(!group) errors.push("Missing linked-versions group");
for(const p of paths){
  const pkg=JSON.parse(readFileSync(join(p,"package.json"),"utf8"));
  const component=pkg.name.replace(/^@godspeedai\//,"");
  if(!group?.components?.includes(component)) errors.push(`Component missing from linked-versions: ${component}`);
}
// The release PR must be built only after the component tags exist. The release-please job
// runs releases only (skip-github-pull-request: true); a separate release-pr job that needs
// tag-components builds the PR (skip-github-release: true). Building the PR in the same job
// as the release raced the tag minting and opened spurious PRs (#38, and #86 proposing
// 0.3.0 over the published 0.10.0) whatever the merge method or commit message.
// YAML comments are stripped first so commented-out protection does not satisfy the checks.
const workflow=readFileSync(".github/workflows/release.yml","utf8").replace(/(^|\s)#.*$/gm,"$1");
// Split the workflow into its top-level jobs (two-space indented keys under "jobs:").
const jobs={};
for(const m of workflow.split(/^jobs:\s*$/m)[1]?.matchAll(/^  ([A-Za-z0-9_-]+):\s*\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:\s*$|(?![\s\S]))/gm)||[]) jobs[m[1]]=m[2];
const rel=jobs["release-please"]||"", pr=jobs["release-pr"]||"";
if(!/release-please-action[\s\S]*skip-github-pull-request:\s*true\b/.test(rel)) errors.push("release.yml: the release-please job must run releases only (skip-github-pull-request: true)");
if(!/release-please-action[\s\S]*skip-github-release:\s*true\b/.test(pr)) errors.push("release.yml: a release-pr job must build the release PR only (skip-github-release: true)");
if(!/^\s*needs:.*\btag-components\b/m.test(pr)) errors.push("release.yml: release-pr must need tag-components so the PR is built after the component tags exist");
if(!/run:\s*node scripts\/require-component-tags\.mjs[\s\S]*release-please-action/.test(pr)) errors.push("release.yml: release-pr must run scripts/require-component-tags.mjs before release-please builds the PR");
{
  // The guard step must always execute and always block: no step-level if, no continue-on-error.
  const step=pr.match(/- name: Require every component tag[\s\S]*?(?=\n\s*- (?:name|uses):)/)?.[0]||"";
  if(!step) errors.push("release.yml: release-pr has no 'Require every component tag' step");
  if(/^\s*if:/m.test(step)||/continue-on-error/.test(step)) errors.push("release.yml: the component-tag guard step must not have an if: condition or continue-on-error");
  if(/continue-on-error/.test(pr.split("- name: Require every component tag")[0])) errors.push("release.yml: release-pr must not use continue-on-error");
}
if(!/ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/.test(pr)) errors.push("release.yml: release-pr must check out the live default branch (the manifest release-please reads)");
if(!/^\s*if:.*needs\.tag-components\.result == 'skipped'/m.test(pr)||!/^\s*if:.*always\(\)/m.test(pr)) errors.push("release.yml: release-pr must run when tag-components is skipped (ordinary pushes) via if: always() && ... == 'skipped'");
// The guard must actually work: in a throwaway repository with the same release plan it
// must refuse (naming the missing tags) without tags, and pass once every planned tag exists.
{
  const {mkdtempSync,mkdirSync,cpSync,rmSync,writeFileSync}=await import("node:fs"); const {tmpdir}=await import("node:os"); const {spawnSync,execFileSync}=await import("node:child_process");
  const d=mkdtempSync(join(tmpdir(),"rct-"));
  const git=(...a)=>execFileSync("git",["-c","user.name=check","-c","user.email=check@invalid",...a],{cwd:d,stdio:"ignore"});
  const run=()=>spawnSync(process.execPath,["scripts/require-component-tags.mjs"],{cwd:d,encoding:"utf8"});
  try{
    for(const f of ["scripts","release-please-config.json",".release-please-manifest.json"]) cpSync(f,join(d,f),{recursive:true});
    for(const path of Object.keys(config.packages)){ mkdirSync(join(d,path),{recursive:true}); cpSync(join(path,"package.json"),join(d,path,"package.json")); }
    git("init","-q"); git("add","-A"); git("commit","-q","-m","fixture");
    const none=run();
    if(none.status===0||!/are missing/.test(none.stderr)) errors.push("scripts/require-component-tags.mjs did not refuse a repository without component tags");
    const plan=JSON.parse(execFileSync(process.execPath,["scripts/plan-sdk-release.mjs"],{cwd:d,encoding:"utf8"}));
    for(const t of plan.tags.slice(1)) git("tag",t);
    const one=run();
    if(one.status===0) errors.push("scripts/require-component-tags.mjs accepted a repository missing one component tag");
    git("tag",plan.tags[0]);
    if(run().status!==0) errors.push("scripts/require-component-tags.mjs refused a repository with every component tag");
  } finally { rmSync(d,{recursive:true,force:true}); }
}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(`Unified release config OK: ${paths.length} SDK packages, one public GitHub Release, individual component tags`);
