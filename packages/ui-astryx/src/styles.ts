import { fileURLToPath } from "node:url";

/** Absolute paths of the Astryx CSS files a host page must serve/link (Astryx ships pre-compiled CSS; ADR-0009). */
export function stylesheetPaths(): readonly string[] {
  return [fileURLToPath(import.meta.resolve("@astryxdesign/core/astryx.css")), fileURLToPath(import.meta.resolve("@astryxdesign/theme-neutral/theme.css"))];
}
