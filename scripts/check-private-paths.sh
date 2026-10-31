#!/usr/bin/env bash
# Private-path / machine-identity leak guard.
#
# Scans file CONTENT for developer home-directory paths and other
# machine-specific identifiers, which secret scanners do not cover
# (e.g. /home/<user>/..., /Users/<user>/..., C:\Users\<user>\...,
# /mnt/c/Users/<user>/..., file:///home/<user>/...).
#
# Usage:
#   scripts/check-private-paths.sh --staged              # scan the staged index (pre-commit)
#   scripts/check-private-paths.sh --range <base> <head> # scan files changed between two refs (CI)
#
# Exit 0: clean. Exit 1: findings OR tool failure (fail closed).
# Output is redacted: usernames inside matched paths are never printed.
#
# Narrow, auditable exceptions live in .githooks/private-path-allowlist
# (one extended regex per line; lines starting with # are comments).
set -uo pipefail

fail() {
    echo "check-private-paths: $*" >&2
    exit 1
}

[ "${1:-}" = "--staged" ] || [ "${1:-}" = "--range" ] ||
    fail "usage: check-private-paths.sh --staged | --range <base> <head>"

command -v git >/dev/null 2>&1 || fail "git is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not inside a git repository"

# Machine-specific path signatures. Matched segments are redacted before printing.
PATTERN='(/home/[A-Za-z0-9_.@-]+/|/Users/[A-Za-z0-9_.@-]+/|/mnt/[A-Za-z]/Users/[A-Za-z0-9_.@-]+/|file:///home/[A-Za-z0-9_.@-]+/|[A-Za-z]:\\+Users\\+[A-Za-z0-9_.@-]+)'

# Illustrative placeholders that are never private. Kept narrow and explicit.
PLACEHOLDER='/(home|Users)/(me|user|you|youruser|username|example|app|dev|devuser|alice|bob|node|playwright|logs?)/'

ALLOWLIST_FILE="$TOP/.githooks/private-path-allowlist"
ALLOWLIST=""
if [ -f "$ALLOWLIST_FILE" ]; then
    # Extract non-comment, non-empty lines as extra exclusion regexes.
    ALLOWLIST="$(grep -vE '^\s*(#|$)' "$ALLOWLIST_FILE" || true)"
fi

# Optional per-developer DETECTION rules (e.g. your own username), read from a
# GITIGNORED local file so real identities are never committed. One extended
# regex per line; # starts a comment. Findings from these rules are labelled.
LOCAL_RULES_FILE="$TOP/.githooks/local-identity-rules"
LOCAL_RULES=""
if [ -f "$LOCAL_RULES_FILE" ]; then
    LOCAL_RULES="$(grep -vE '^\s*(#|$)' "$LOCAL_RULES_FILE" || true)"
fi

redact() {
    sed -E \
        -e 's#/home/[^/:[:space:]]+/#/home/<redacted>/#g' \
        -e 's#/Users/[^/:[:space:]]+/#/Users/<redacted>/#g' \
        -e 's#/mnt/./Users/[^/:[:space:]]+/#/mnt/?/Users/<redacted>/#g' \
        -e 's#file:///home/[^/:[:space:]]+/#file:///home/<redacted>/#g' \
        -e 's#[A-Za-z]:\\+Users\\+[A-Za-z0-9_.@-]+#?:\\Users\\<redacted>#g'
}

FINDINGS=0
while IFS= read -r -d '' f; do
    # Vendored third-party trees and binary artifacts are out of scope.
    case "$f" in
        */node_modules/* | node_modules/* | .tmp/*) continue ;;
        *.png | *.jpg | *.jpeg | *.gif | *.ico | *.webp | *.woff | *.woff2 | \
            *.ttf | *.otf | *.pdf | *.zip | *.tgz | *.gz | *.xz | *.node | \
            *.sqlite | *.db | *.sea) continue ;;
    esac

    if [ "$1" = "--staged" ]; then
        content="$(git show ":$f" 2>/dev/null)"
    else
        content="$(git show "$3:$f" 2>/dev/null)"
    fi
    [ -n "$content" ] || continue

    hits="$(printf '%s\n' "$content" | grep -naI -E "$PATTERN" | grep -vE "$PLACEHOLDER" || true)"

    # Narrow allowlist: drop lines matching any documented exception regex.
    if [ -n "$ALLOWLIST" ] && [ -n "$hits" ]; then
        filtered=""
        while IFS= read -r line; do
            [ -n "$line" ] || continue
            keep=1
            while IFS= read -r rule; do
                [ -n "$rule" ] || continue
                if printf '%s' "$line" | grep -qE "$rule"; then keep=0; break; fi
            done <<< "$ALLOWLIST"
            [ "$keep" = 1 ] && filtered+="${line}"$'\n'
        done <<< "$hits"
        hits="$filtered"
    fi

    if [ -n "$hits" ]; then
        if [ "$FINDINGS" = 0 ]; then
            echo "check-private-paths: machine-specific path(s) detected in staged/changed content:" >&2
        fi
        FINDINGS=1
        printf '  %s\n' "$hits" | redact >&2
    fi

    # Per-developer local rules (gitignored): each rule is its own regex.
    if [ -n "$LOCAL_RULES" ]; then
        while IFS= read -r rule; do
            [ -n "$rule" ] || continue
            lhits="$(printf '%s\n' "$content" | grep -naI -E "$rule" || true)"
            if [ -n "$lhits" ]; then
                if [ "$FINDINGS" = 0 ]; then
                    echo "check-private-paths: machine-specific path(s) detected in staged/changed content:" >&2
                fi
                FINDINGS=1
                printf '  [local rule] %s\n' "$lhits" | redact >&2
            fi
        done <<< "$LOCAL_RULES"
    fi
done < <(
    if [ "$1" = "--staged" ]; then
        git diff --cached --name-only -z --diff-filter=ACMR
    else
        [ $# -eq 3 ] || fail "--range requires a base and head ref"
        git diff --name-only -z --diff-filter=ACMR "$2" "$3"
    fi
)

if [ "$FINDINGS" = 1 ]; then
    echo "check-private-paths: replace private paths with repository-relative or ~ paths before committing." >&2
    echo "  Genuine exceptions: add a narrow regex to .githooks/private-path-allowlist (document it)." >&2
    exit 1
fi

exit 0
