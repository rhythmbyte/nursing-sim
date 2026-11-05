#!/usr/bin/env bash
# PreToolUse hook (Bash): block any command that mentions .env files.
# Backs up the permissions.deny rules in settings.json, which only match specific command shapes.
# Exit 2 = block the call; stderr is shown to Claude as the reason.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)

if [[ "$cmd" == *".env"* ]]; then
  echo "Blocked: command references a .env file. Never read, write, search, or print .env files (see CLAUDE.md)." >&2
  exit 2
fi
exit 0
