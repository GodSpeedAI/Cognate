export type Repo = 'GodSpeedAI/Cognate' | 'GodSpeedAI/Cognate-Workbench';

export type LayerId = 'L1' | 'L2' | 'L3' | 'L4';

export interface Layer {
  readonly id: LayerId;
  readonly label: string;
}

export type PartKind = 'cognate' | 'workbench' | 'both';

export interface SourceRef {
  readonly repo: Repo;
  readonly sha: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface Part {
  readonly id: string;
  readonly label: string;
  readonly job: string;
  readonly why: string;
  readonly kind: PartKind;
  /** The parts the extension beat adds later, after the first build. */
  readonly branchOnly?: true;
  /** sources[0] is the file the excerpt is copied from. */
  readonly sources: readonly SourceRef[];
  readonly excerpt: string;
  readonly excerptCaption: string;
}

export type EdgeKind = 'invokes' | 'requires' | 'stores-in';

export interface EdgeEvidence {
  readonly repo: Repo;
  readonly sha: string;
  readonly path: string;
  readonly line: number;
}

/** `from` depends on `to`. Only edges verified in source are listed. */
export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly evidence: EdgeEvidence;
}

export interface Capture {
  readonly file: string;
  readonly repo: Repo;
  readonly sha: string;
  readonly sourcePath: string;
  readonly width: number;
  readonly height: number;
  readonly shows: string;
  readonly caption: string;
  readonly alt: string;
}
