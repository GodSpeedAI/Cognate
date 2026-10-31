#!/usr/bin/env bash
# Activate the committed Git hooks for this clone (idempotent).
#
# Git does not copy hooksPath configuration on clone, so every fresh clone
# (and every new contributor) must run this once:
#
#   bash scripts/install-security-hooks.sh
#
# Worktrees share the repository config, so the setting applies everywhere.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

chmod +x .githooks/pre-commit 2>/dev/null || true

current="$(git config --get core.hooksPath || true)"
if [ "$current" != ".githooks" ]; then
    git config core.hooksPath .githooks
    echo "core.hooksPath set to .githooks"
else
    echo "core.hooksPath already .githooks (no change)"
fi

if command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks: $(gitleaks version 2>&1 | head -1)"
else
    echo "WARNING: gitleaks is not installed. Commits will be BLOCKED until it is available." >&2
    echo "  Install gitleaks 8.x: https://github.com/gitleaks/gitleaks#installing" >&2
    exit 1
fi
