#!/usr/bin/env bash
# Stop hook: commit and push any uncommitted work at the end of each Claude Code turn.
# Runs from the folder Claude Code was opened in. Safety net against freezes/crashes.
# Never blocks Claude Code; always exits 0.

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit --quiet -m "autosave: $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1 || true
fi

# Push any local commits (including ones Claude Code made itself). Fails silently if no remote yet.
git push --quiet >/dev/null 2>&1 || true
exit 0
