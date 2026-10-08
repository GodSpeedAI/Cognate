// Root tests (tests/, profiles) import workspace packages; Bun's isolated linker requires the root to declare them.
import { readdirSync, existsSync } from "node:fs";

const pkg = await Bun.file("package.json").json();
const names: string[] = [];
for (const base of ["packages", "profiles"]) {
  if (!existsSync(base)) continue;
  for (const dir of readdirSync(base)) {
    const manifest = `${base}/${dir}/package.json`;
    if (existsSync(manifest)) names.push((await Bun.file(manifest).json()).name);
  }
}
const dev = { ...pkg.devDependencies };
for (const key of Object.keys(dev)) if (key.startsWith("@godspeedai/") && !names.includes(key)) delete dev[key];
for (const name of names.sort()) dev[name] = "workspace:*";
pkg.devDependencies = Object.fromEntries(Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)));
await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`root devDependencies include ${names.length} workspace packages`);
