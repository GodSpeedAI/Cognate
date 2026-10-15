import type { Part } from '../data/types';
import { dependsOn, edgeWord, kindLabel, partById, titleCase, usedBy } from '../lib/graph';
import { githubUrl, sourceLabel } from '../lib/links';

interface Props {
  part: Part | undefined;
  onClose?: () => void;
}

/** Labelled region; announced politely when the selection changes (aria-live is on the region). */
export default function Inspector({ part, onClose }: Props) {
  if (!part) {
    return (
      <section className="inspector" data-open="false" aria-labelledby="inspector-title" aria-live="polite">
        <h3 id="inspector-title">Part inspector</h3>
        <p>Select a part to see what it does, what it depends on, and where its source lives.</p>
      </section>
    );
  }

  const deps = dependsOn(part.id);
  const users = usedBy(part.id);
  const primary = part.sources[0];

  return (
    <section className="inspector" data-open="true" aria-labelledby="inspector-title" aria-live="polite">
      <div className="inspector-head">
        <h3 id="inspector-title">
          <span className="mono">{part.id}</span> {titleCase(part.label)}
        </h3>
        {onClose && (
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="inspector-tags">
        {kindLabel(part.kind)}
        {part.branchOnly ? ' · in development (branch)' : ''}
      </p>
      <dl className="inspector-facts">
        <dt>What it does</dt>
        <dd>{part.job}</dd>
        <dt>Why it matters</dt>
        <dd>{part.why}</dd>
        <dt>Depends on</dt>
        <dd>
          {deps.length === 0 ? (
            'No verified dependencies.'
          ) : (
            <ul>
              {deps.map((e) => (
                <li key={`${e.from}-${e.to}-${e.kind}`}>
                  {e.to} {titleCase(partById(e.to)?.label ?? '')} <span className="edge-word">({edgeWord(e.kind)})</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Used by</dt>
        <dd>
          {users.length === 0 ? (
            'No verified dependents.'
          ) : (
            <ul>
              {users.map((e) => (
                <li key={`${e.from}-${e.to}-${e.kind}`}>
                  {e.from} {titleCase(partById(e.from)?.label ?? '')} <span className="edge-word">({edgeWord(e.kind)})</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <details className="code">
        <summary>Show the code</summary>
        <figure>
          <pre>
            <code>{part.excerpt}</code>
          </pre>
          <figcaption>{part.excerptCaption}</figcaption>
        </figure>
        <p>
          <a href={githubUrl(primary)} rel="noopener">
            {sourceLabel(primary)} on GitHub
          </a>
        </p>
      </details>
    </section>
  );
}
