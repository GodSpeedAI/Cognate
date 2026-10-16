import { useEffect, useState } from 'react';
import { firstRequest, mkdirCommand, checkCommand, skillCommand, testCommand } from '../data/onboarding';

// Beat H. Four steps, progress kept in localStorage (try/catch), copy buttons, an "It failed" drawer per step.
const STORAGE_KEY = 'cognate-onboarding-v1';
type Path = 'agent' | 'new';

const STEPS = [
  { id: 'tools', title: 'Check you have the tools.', body: 'Bun 1.4 or newer, git, Node.js and a coding agent such as Claude Code.' },
  { id: 'skill', title: 'Give your agent the skill.', body: 'Run both commands in order, in the same terminal. The first makes a refund-desk folder and moves into it. Expected: "Installed 3 skills", with files under .claude/skills/.' },
  { id: 'ask', title: 'Ask your agent.', body: 'Paste this request into your coding agent. It is the same request the README uses.' },
  { id: 'check', title: 'Check it yourself.', body: 'Run the tests. You are done when they pass on your machine.' },
] as const;

const NEW_PATH_NOTES: Record<(typeof STEPS)[number]['id'], string> = {
  tools: 'A terminal is the window where you type commands. Bun is the program that runs the app.',
  skill: 'A skill is a set of instructions your coding agent reads before it writes code.',
  ask: 'The agent reads the request, plans the app and writes the code. You read the result.',
  check: '"Tests pass" means each check the agent wrote runs and succeeds. Read the output; do not trust a claim alone.',
};

function readChecked(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeChecked(value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked). The checklist still works for this visit.
  }
}

function CopyButton({ text, targetId }: { text: string; targetId: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      const el = document.getElementById(targetId);
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setStatus('manual');
    }
    window.setTimeout(() => setStatus('idle'), 2000);
  };
  return (
    <>
      <button type="button" className="btn copy-btn" onClick={onClick}>
        Copy
      </button>
      <span className="copy-status" aria-live="polite">
        {status === 'copied' ? 'Copied' : status === 'manual' ? 'Select and copy manually' : ''}
      </span>
    </>
  );
}

export default function Onboarding() {
  const [path, setPath] = useState<Path>('agent');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setChecked(readChecked());
    setHydrated(true);
  }, []);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    writeChecked(next);
  };
  const reset = () => {
    setChecked({});
    writeChecked({});
  };
  const done = STEPS.every((s) => checked[s.id]);

  return (
    <div className="onboarding" data-hydrated={hydrated ? 'true' : 'false'}>
      <fieldset className="path">
        <legend>Your path</legend>
        <button type="button" className="btn" aria-pressed={path === 'agent'} onClick={() => setPath('agent')}>
          I use a coding agent
        </button>
        <button type="button" className="btn" aria-pressed={path === 'new'} onClick={() => setPath('new')}>
          I'm new to coding agents
        </button>
      </fieldset>

      <ol className="checklist">
        <li className="ob-step" id="ob-tools">
          <label className="ob-check">
            <input type="checkbox" checked={!!checked.tools} onChange={() => toggle('tools')} /> <h3>1. Check you have the tools.</h3>
          </label>
          <p>{STEPS[0].body} Optional: Rust's <span className="mono">cargo</span>, if your agent wants to install the DomainForge checker (the skill also has a check that needs no install).</p>
          {path === 'new' && <p className="new-note">{NEW_PATH_NOTES.tools}</p>}
          <pre id="cmd-check">
            <code>{checkCommand}</code>
          </pre>
          <p>Expected: <span className="mono">1.4.0</span> or higher. If you see "bun: command not found", install Bun from bun.sh and open a new terminal. If <span className="mono">bunx</span> isn't found, use <span className="mono">bun x</span>.</p>
          <CopyButton text={checkCommand} targetId="cmd-check" />
          <details className="failed">
            <summary>It failed</summary>
            <p>Install from bun.sh, open a new terminal, then run the check again. If bunx is not found, use <span className="mono">bun x</span>.</p>
          </details>
        </li>

        <li className="ob-step" id="ob-skill">
          <label className="ob-check">
            <input type="checkbox" checked={!!checked.skill} onChange={() => toggle('skill')} /> <h3>2. Give your agent the skill.</h3>
          </label>
          <p>{STEPS[1].body}</p>
          {path === 'new' && <p className="new-note">{NEW_PATH_NOTES.skill}</p>}
          <pre id="cmd-skill-a">
            <code>{mkdirCommand}</code>
          </pre>
          <CopyButton text={mkdirCommand} targetId="cmd-skill-a" />
          <pre id="cmd-skill-b">
            <code>{skillCommand}</code>
          </pre>
          <CopyButton text={skillCommand} targetId="cmd-skill-b" />
          <p className="note">Using another agent? Change <span className="mono">-a</span> (see <span className="mono">npx skills add --help</span>). <a href="https://skills.sh/godspeedai/cognate/building-with-cognate">skills.sh listing</a>: coming soon.</p>
          <details className="failed">
            <summary>It failed</summary>
            <p>Install takes about a minute because it downloads the repo. If it fails, copy <span className="mono">.agents/skills/building-with-cognate</span>, <span className="mono">deriving-interaction-domain-models</span> and <span className="mono">domainforge-sea</span> from GitHub into <span className="mono">.claude/skills/</span>.</p>
          </details>
        </li>

        <li className="ob-step" id="ob-ask">
          <label className="ob-check">
            <input type="checkbox" checked={!!checked.ask} onChange={() => toggle('ask')} /> <h3>3. Ask your agent.</h3>
          </label>
          <p>{STEPS[2].body}</p>
          {path === 'new' && <p className="new-note">{NEW_PATH_NOTES.ask}</p>}
          <pre id="cmd-ask">
            <code>{firstRequest}</code>
          </pre>
          <CopyButton text={firstRequest} targetId="cmd-ask" />
          <details className="failed">
            <summary>It failed</summary>
            <p>If the agent didn't use the skill, start your message with "Use the building-with-cognate skill". If it wants the DomainForge CLI, let it install with <span className="mono">cargo install domainforge-core --features cli --locked</span>, or tell it to use the skill's no-CLI check. If it asks for a Cognate source checkout or tries <span className="mono">cognate create</span>, tell it: "Don't use <span className="mono">cognate create</span>. Add the published <span className="mono">@godspeedai/cognate-*</span> packages with <span className="mono">bun add</span> and build the app directly." That's the verified route.</p>
          </details>
        </li>

        <li className="ob-step" id="ob-check">
          <label className="ob-check">
            <input type="checkbox" checked={!!checked.check} onChange={() => toggle('check')} /> <h3>4. Check it yourself.</h3>
          </label>
          <p>{STEPS[3].body}</p>
          {path === 'new' && <p className="new-note">{NEW_PATH_NOTES.check}</p>}
          <pre id="cmd-test">
            <code>{testCommand}</code>
          </pre>
          <p>Expected: passing tests for each journey. A small refund completes. A large refund waits for approval. Approval completes it. Denial refunds nothing. The history records each step.</p>
          <CopyButton text={testCommand} targetId="cmd-test" />
          <details className="failed">
            <summary>It failed</summary>
            <p>If you see SQLITE_CANTOPEN, the app's data folder does not exist yet; ask the agent to create it on start. If tests fail, paste the output to your agent and ask it to fix the failing journey, then run bun test again.</p>
          </details>
        </li>
      </ol>

      <div className="progress" aria-live="polite">
        <p>{STEPS.filter((s) => checked[s.id]).length} of 4 steps checked.</p>
        <button type="button" className="btn btn-quiet" onClick={reset}>
          Reset progress
        </button>
      </div>

      {done && (
        <section className="success" aria-labelledby="success-title">
          <h3 id="success-title">That's a working agentic application, built by an agent you directed and checked by you.</h3>
          <ul>
            <li>Make it yours: copy the extension request and ask your agent to add a capability.</li>
            <li>Compare with the reference answer: <span className="mono">cd examples/refund-desk && bun install && bun test</span></li>
            <li>Read the README and explore the docs.</li>
          </ul>
        </section>
      )}

      <p className="honest-note">
        Cognate is v0, and APIs will change before 1.0. For developers: the <span className="mono">cognate create</span> template command still needs a copy of the Cognate source. This path doesn't use it.
      </p>
    </div>
  );
}
