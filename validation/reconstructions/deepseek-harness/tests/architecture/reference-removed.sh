#!/usr/bin/env bash
# Phase 8, criterion 8 (literal, per spec): Cognate works after the reference checkout is physically
# removed. Steps, each printing PASS/FAIL:
#   (a) move .tmp/ref/deepseek-harness to a temp location OUTSIDE the repo, restoring on exit (trap)
#   (b) bun install --frozen-lockfile at the repo root
#   (c) bun run typecheck
#   (d) bun test validation/reconstructions/deepseek-harness/cognate/test
#   (e) launch APP with the mock model and run a Cognate-only Playwright capture (one viewport) as a smoke
#   (f) restore the reference (guaranteed by the trap, independent of success/failure above)
# Exits non-zero if any step fails.
set -u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
REF_DIR="$ROOT/.tmp/ref/deepseek-harness"
STASH_DIR=""
OVERALL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; OVERALL=1; }

restore_reference() {
  # The run only proves anything if nothing recreated the reference while it was stashed.
  if [ -n "$STASH_DIR" ] && [ -e "$REF_DIR" ]; then
    fail "(e') reference reappeared at $REF_DIR during the run; the removal run is invalid (leaving the stash at $STASH_DIR)"
    exit 1
  fi
  if [ -n "$STASH_DIR" ] && [ -d "$STASH_DIR" ] && [ ! -e "$REF_DIR" ]; then
    mkdir -p "$(dirname "$REF_DIR")"
    mv "$STASH_DIR" "$REF_DIR"
    if [ -d "$REF_DIR" ]; then
      echo "PASS: (f) reference restored to $REF_DIR"
    else
      echo "FAIL: (f) reference restore did not land at $REF_DIR"
      OVERALL=1
    fi
  elif [ -e "$REF_DIR" ]; then
    echo "PASS: (f) reference already present at $REF_DIR (nothing to restore, or restore already ran)"
  else
    echo "FAIL: (f) reference is missing and no stash was recorded to restore it from"
    OVERALL=1
  fi
}
trap restore_reference EXIT

# --- (a) move the reference checkout outside the repo -----------------------------------------
if [ -d "$REF_DIR" ]; then
  STASH_DIR="$(mktemp -d /tmp/deepseek-harness-ref-stash.XXXXXX)"
  rmdir "$STASH_DIR"
  if mv "$REF_DIR" "$STASH_DIR"; then
    pass "(a) moved $REF_DIR to $STASH_DIR (outside the repo)"
  else
    fail "(a) failed to move $REF_DIR to $STASH_DIR"
    exit 1
  fi
else
  fail "(a) reference checkout $REF_DIR was not present to begin with — cannot prove removal changed anything"
fi

# --- (b) clean install at root ----------------------------------------------------------------
if (cd "$ROOT" && bun install --frozen-lockfile); then
  pass "(b) bun install --frozen-lockfile"
else
  fail "(b) bun install --frozen-lockfile"
fi

# --- (c) typecheck ------------------------------------------------------------------------------
if (cd "$ROOT" && bun run typecheck); then
  pass "(c) bun run typecheck"
else
  fail "(c) bun run typecheck"
fi

# --- (d) APP test suite --------------------------------------------------------------------------
if (cd "$ROOT" && bun test validation/reconstructions/deepseek-harness/cognate/test); then
  pass "(d) bun test validation/reconstructions/deepseek-harness/cognate/test"
else
  fail "(d) bun test validation/reconstructions/deepseek-harness/cognate/test"
fi

# --- (e) launch with mock model + Cognate-only Playwright capture smoke ------------------------
SMOKE_HOME="$(mktemp -d /tmp/deepseek-harness-smoke-home.XXXXXX)"
SMOKE_WS="$(mktemp -d /tmp/deepseek-harness-smoke-ws.XXXXXX)"
MOCK_PID=""
cleanup_smoke() {
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  rm -rf "$SMOKE_HOME" "$SMOKE_WS"
}
(
  cd "$ROOT"
  bun validation/reconstructions/deepseek-harness/fixtures/mock-model/server.ts --port=4010 &
  echo $! > /tmp/deepseek-harness-mock.pid
  sleep 1
)
MOCK_PID="$(cat /tmp/deepseek-harness-mock.pid 2>/dev/null || echo "")"
rm -f /tmp/deepseek-harness-mock.pid

if [ -n "$MOCK_PID" ] && (cd "$ROOT" && bun run validation/reconstructions/deepseek-harness/tests/capture/cognate.capture.ts smoke 1280 800 "$SMOKE_HOME" 3191 "$SMOKE_WS"); then
  pass "(e) Cognate-only Playwright capture smoke (mock model + APP, no reference on disk)"
else
  fail "(e) Cognate-only Playwright capture smoke"
fi
cleanup_smoke

exit $OVERALL
