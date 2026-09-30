import { type ReactNode, useId, useState } from "react";

/**
 * Shared UI primitives for the reconstruction surface. Every visual rule these
 * express lives in `tokens.css`; DESIGN.md is the authority for both. Nothing
 * here reaches for a colour or spacing value of its own.
 */

export function JourneyHead({ step, title, claim }: { readonly step: string; readonly title: string; readonly claim: string }): ReactNode {
  return (
    <div className="journey__head">
      <span className="journey__step">{step}</span>
      <h2 className="journey__title">{title}</h2>
      <p className="journey__claim">{claim}</p>
    </div>
  );
}

/** Progressive disclosure: diagnostic payloads never render open. */
export function Disclosure({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="disclosure">
      <button type="button" className="disclosure__trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span className="disclosure__chevron" aria-hidden="true" />
        {label}
      </button>
      <div className="disclosure__body" id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** A labelled key/value block for identifiers that are useful but not primary. */
export function KeyValues({ rows }: { readonly rows: readonly (readonly [string, string])[] }): ReactNode {
  return (
    <dl className="kv">
      {rows.map(([key, value]) => (
        <div key={key} style={{ display: "contents" }}>
          <dt className="kv__key">{key}</dt>
          <dd className="kv__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A state word paired with a hue. Status is never communicated by colour alone. */
export function StateTag({ tone, children }: { readonly tone: "ok" | "busy" | "fault" | "neutral"; readonly children: ReactNode }): ReactNode {
  const modifier = tone === "neutral" ? "" : ` tag--${tone}`;
  return <span className={`tag${modifier}`}>{children}</span>;
}

export function Note({ children, tone = "error" }: { readonly children: ReactNode; readonly tone?: "error" | "info" }): ReactNode {
  return (
    <p className={tone === "info" ? "note note--info" : "note"} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}