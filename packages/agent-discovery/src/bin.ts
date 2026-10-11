#!/usr/bin/env bun
/** Read-only local inventory. Project hook settings are never executed. */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { discoverAgents } from "./index.ts";

const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
const projectRoot = resolve(process.argv[2] ?? process.cwd());
const agents = await discoverAgents({ home, projectRoot });
const report = agents.map(a => ({
  id: a.id, status: a.status,
  executablePaths: a.executablePaths, configPaths: a.configPaths,
  skills: a.skills, extensions: a.extensions, evidence: a.evidence,
  unverified: a.unverified,
  hooks: {
    discovery: a.hooks.discovery, unresolved: a.hooks.unresolved,
    hooks: a.hooks.hooks.map(h => ({
      id: h.id, origin: h.origin, phase: h.phase, fidelity: h.fidelity,
      matcher: h.matcher, handler: h.handler, enabled: h.enabled,
      trust: h.trust, evidence: h.evidence,
    })),
  },
}));
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
