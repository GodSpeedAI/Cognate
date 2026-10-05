#!/usr/bin/env bash
# Boot the pinned CopilotKit reference against CopilotKit's own mock LLM.
#
# This exists because the reconstruction instructions (Phase 1B) forbid making
# reference execution depend on a paid model endpoint. Every command below was
# authored without a working shell in the authoring session, so step [0] proves
# the script is executable in this environment before any claim is made from it.
#
# Usage:  ./run-reference-mock.sh [cold-install|start|probe]
set -uo pipefail

REF=/home/sprime01/projects/cognate/.tmp/ref/copilotkit
STARTER=$REF/examples/integrations/langgraph-js
MOCK_BIN=$REF/showcase/scripts/node_modules/.bin
MOCK_FIXTURES=$REF/showcase/aimock
PORT=13360
MOCK_URL=http://127.0.0.1:$PORT/v1
UI_PORT=3111
AGENT_PORT=8123
STATE=/tmp/ck-ref-mock
LOG=/tmp/ck-ref-mock.log

mkdir -p "$STATE"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1" >&2; exit 90; }
}

step0_preflight() {
  echo "== [0] preflight =="
  need node; need npm; need curl; need pnpm
  [ -f "$REF/package.json" ] || { echo "reference checkout absent at $REF" >&2; exit 91; }
  # NOTE: this tree was extracted from the pinned commit's tarball, so it has no .git
  # and cannot self-attest its SHA. Pin provenance comes from reference-manifest.json
  # plus the file-by-file comparison of the extracted tree against the pinned tarball
  # (21,195 of 21,195 files identical). Do not "fix" this check by adding a git check.
  [ -d "$REF/.git" ] && echo "note: .git present - tree is a clone, pin is self-attestable"
  [ -x "$MOCK_BIN/llmock" ] || { echo "llmock absent - run npm install in $REF/showcase/scripts" >&2; exit 91; }
  [ -x "$MOCK_BIN/aimock" ] && "$MOCK_BIN/aimock" --help 2>&1 | grep -q -- '--config' \
    || { echo "aimock CLI does not expose --config - aborting before wrong-CLI use" >&2; exit 92; }
  node -e 'console.log("node", process.version)'
  echo "PREFLIGHT_OK"
}

install() {
  echo "== [1] install (postinstall also installs the agent) =="
  cd "$STARTER"
  npm install --no-audit --no-fund 2>&1 | tail -20
  echo "INSTALL_RC=$?"
}

start_mock() {
  echo "== [2] start mock LLM =="
  pkill -f "llmock -f $MOCK_FIXTURES" 2>/dev/null || true
  sleep 1
  cd "$REF"
  setsid nohup "$MOCK_BIN/llmock" -f "$MOCK_FIXTURES" --validate-on-load \
    --port "$PORT" >"$STATE/llmock.log" 2>&1 &
  echo $! >"$STATE/llmock.pid"
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1 && { echo "MOCK_READY"; return 0; }
    sleep 0.5
  done
  echo "MOCK_NOT_READY"; tail -20 "$STATE/llmock.log"; return 1
}

probe_mock() {
  echo "== [3] mock probes (no API key must be set) =="
  env -u OPENAI_API_KEY -u OPENAI_BASE_URL node -e '
    const key = process.env.OPENAI_API_KEY;
    if (key) { console.log("PROBE_ABORT key present"); process.exit(3); }
  ' || return 1
  echo "-- models --"
  curl -sf "$MOCK_URL/models" | head -c 300; echo
  echo "-- non-streaming --"
  curl -sf "$MOCK_URL/chat/completions" -H 'content-type: application/json' \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}' | head -c 400; echo
  echo "-- streaming --"
  curl -sf -N "$MOCK_URL/chat/completions" -H 'content-type: application/json' \
    -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"hi"}]}' \
    | head -c 400; echo
}

start_app() {
  echo "== [4] start reference app against the mock =="
  cd "$STARTER"
  pkill -f "next dev --turbopack" 2>/dev/null || true
  sleep 1
  setsid nohup env \
    OPENAI_API_KEY=aimock \
    OPENAI_BASE_URL="$MOCK_URL" \
    OPENAI_MODEL=gpt-4o-mini \
    AGENT_URL="http://localhost:$AGENT_PORT" \
    PORT="$UI_PORT" \
    npm run dev >"$STATE/app.log" 2>&1 &
  echo $! >"$STATE/app.pid"
  for _ in $(seq 1 80); do
    curl -sf "http://127.0.0.1:$UI_PORT" >/dev/null 2>&1 && { echo "APP_READY"; return 0; }
    sleep 1
  done
  echo "APP_NOT_READY"; tail -40 "$STATE/app.log"; return 1
}

stop_all() {
  echo "== teardown =="
  for f in "$STATE"/*.pid; do [ -f "$f" ] && kill -TERM "$(cat "$f")" 2>/dev/null || true; done
  pkill -f "llmock -f $MOCK_FIXTURES" 2>/dev/null || true
  pkill -f "next dev --turbopack" 2>/dev/null || true
  echo "STOPPED"
}

case "${1:-start}" in
  cold-install) step0_preflight && install && start_mock && probe_mock ;;
  preflight)    step0_preflight ;;
  mock)         step0_preflight && start_mock && probe_mock ;;
  start)        step0_preflight && start_mock && start_app ;;
  probe)        probe_mock ;;
  stop)         stop_all ;;
  *) echo "unknown mode: $1" >&2; exit 2 ;;
esac
