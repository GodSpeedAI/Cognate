// Determine the release version and all npm publish candidates once Release Please
// has created the single umbrella GitHub release. Fail closed if versions diverge.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const config=JSON.parse(readFileSync("release-please-config.json","utf8"));
const manifest=JSON.parse(readFileSync(".release-please-manifest.json","utf8"));
const umbrella="packages/cognate";
const version=manifest[umbrella];
if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version||""))throw Error(`Invalid SDK version ${version}`);
const paths=Object.keys(config.packages).sort();
const mismatches=[];
const tags=[];
for(const path of paths){
 const pkg=JSON.parse(readFileSync(join(path,"package.json"),"utf8"));
 if(pkg.version!==version || manifest[path]!==version)mismatches.push(`${path}: package=${pkg.version}, manifest=${manifest[path]}, SDK=${version}`);
 if(path!==umbrella)tags.push(`${pkg.name.replace(/^@godspeedai\//,"")}-v${version}`);
}
if(mismatches.length)throw Error("Linked SDK versions diverge; do not publish inconsistent packages:\n"+mismatches.join("\n"));
process.stdout.write(JSON.stringify({version,paths,tags})+"\n");
