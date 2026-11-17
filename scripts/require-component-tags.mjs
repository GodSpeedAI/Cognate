#!/usr/bin/env node
// Refuses (exit 1) while any component tag of the SDK version in the working tree's
// manifest is missing. The release-pr job runs this before release-please builds the
// release PR: building it without those tags yields a spurious "never released" PR
// (#38, #86). Run it in a checkout of the live default branch, which is the manifest
// release-please itself reads.
import { execFileSync } from "node:child_process";

const plan = JSON.parse(execFileSync(process.execPath, ["scripts/plan-sdk-release.mjs"], { encoding: "utf8" }));
const tags = Array.isArray(plan.tags) ? plan.tags : [];
if (tags.length === 0) {
  console.error("require-component-tags: the release plan lists no component tags; refusing");
  process.exit(1);
}
const hasTag = (tag) => {
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const missing = tags.filter((t) => !hasTag(t));
if (missing.length > 0) {
  console.error(`require-component-tags: ${missing.length} of ${tags.length} component tags of ${plan.version} are missing; not building the release PR: ${missing.join(" ")}`);
  process.exit(1);
}
console.log(`require-component-tags: all ${tags.length} component tags of ${plan.version} exist`);
