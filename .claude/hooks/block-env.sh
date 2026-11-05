#!/usr/bin/env bash
# PreToolUse hook (Bash): block any command that mentions .env files.
# Backs up the permissions.deny rules in settings.json, which only match specific command shapes.
# Exit 2 = block the call; stderr is shown to Claude as the reason.
# Fails closed: if jq is missing or the hook input can't be parsed, the command is blocked.

if ! command -v jq >/dev/null 2>&1; then
  echo "Blocked: jq is required by .claude/hooks/block-env.sh (the .env guard) but is not installed. Install jq, then retry." >&2
  exit 2
fi

input=$(cat)

if ! cmd=$(printf '%s' "$input" | jq -er '.tool_input.command // ""' 2>/dev/null); then
  echo "Blocked: .claude/hooks/block-env.sh could not parse the hook input with jq (jq is required), so the command was not checked." >&2
  exit 2
fi

if [[ "$cmd" == *".env"* ]]; then
  echo "Blocked: command references a .env file. Never read, write, search, or print .env files (see CLAUDE.md)." >&2
  exit 2
fi
exit 0
