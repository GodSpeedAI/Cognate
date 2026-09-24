export interface CreateOptions {
  readonly dir: string;
  readonly profile: "copilot" | "harness";
  /** Path to a Cognate source checkout whose packages are packed and vendored (packages are not on npm; DEBT-016). */
  readonly source: string;
  /** Optional components requested beyond the profile; unsupported ones are reported and never imported. */
  readonly with?: readonly string[];
}

export interface CreateReport {
  readonly dir: string;
  readonly files: readonly string[];
  readonly vendored: readonly string[];
  readonly unsupported: readonly { readonly name: string; readonly reason: string }[];
}

/** Generate a starter app from templates/starter for a profile. */
export function create(_options: CreateOptions): Promise<CreateReport> {
  throw new Error("cli: not implemented");
}

export interface DevServer {
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Run an app directory: load `cognate.config.ts`, parse `domain/*.sea` through the DomainForge adapter, create the
 * runtime on `.cognate/app.sqlite`, and serve `/health`, Connect (`/cognate.v1.RuntimeService/*`), AG-UI (`/agui`),
 * and the profile UI (`/`).
 */
export function dev(_options: { readonly dir: string; readonly port: number }): Promise<DevServer> {
  throw new Error("cli: not implemented");
}
