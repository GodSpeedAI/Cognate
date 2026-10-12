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
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(`Unified release config OK: ${paths.length} SDK packages, one public GitHub Release, individual component tags`);
