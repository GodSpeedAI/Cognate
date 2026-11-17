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
if(!/plan-sdk-release\.mjs[\s\S]*rev-parse[\s\S]*exit 1[\s\S]*release-please-action/.test(pr)) errors.push("release.yml: release-pr must refuse to build the PR while any component tag of the current version is missing");
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(`Unified release config OK: ${paths.length} SDK packages, one public GitHub Release, individual component tags`);
