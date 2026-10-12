// Validate Cognate's single public GitHub release + individual npm package model.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync("release-please-config.json", "utf8"));
const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"));
const umbrella = "packages/cognate";
const paths = Object.keys(config.packages);
const errors = [];
if (!paths.includes(umbrella)) errors.push("umbrella packages/cognate missing");
if (config.packages[umbrella]?.["include-component-in-tag"] !== false) errors.push("umbrella must own unprefixed vX.Y.Z tags");
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
