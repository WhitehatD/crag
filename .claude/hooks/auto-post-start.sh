#!/bin/bash
# auto-post-start.sh — Gate enforcement safety net
# Hook type: PreToolUse (Bash)
# Warns if governance gates haven't been run before a git commit
#
# How it works:
# - post-start-validation writes .claude/.gates-passed after gates pass
# - pre-start-context deletes it at session start (forces re-validation)
# - This hook checks for that sentinel before allowing commits

# Read tool input from stdin (Claude Code passes JSON)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only intercept git commit commands (with or without rtk prefix)
if ! echo "$COMMAND" | grep -qE '(^|&&|;\s*)(rtk\s+)?git\s+commit'; then
  exit 0
fi

# If gates already passed this session, allow
if [ -f .claude/.gates-passed ]; then
  exit 0
fi

# Gates haven't passed — warn (non-blocking)
echo "WARNING: Governance gates haven't been verified this session. Run /post-start-validation before committing."
