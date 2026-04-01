#!/bin/bash
# sandbox-guard.sh — PreToolUse hook for Bash
# Hard-blocks destructive system commands. Warns on out-of-bounds paths.
# Enforces host OS safety limits for all tool calls and subagents.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# No command to check — allow
[ -z "$COMMAND" ] && exit 0

# Strip single-quoted strings to avoid false positives on data payloads
# e.g., python script.py '{"content":"rm -rf / is blocked"}' → python script.py ''
CHECK=$(echo "$COMMAND" | sed "s/'[^']*'/''/g")

# === HARD BLOCK: Destructive system-level commands ===

# Filesystem destruction
echo "$CHECK" | grep -qEi 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?/(etc|usr|bin|sbin|boot|lib|var|sys|proc|Windows|Program)' && {
  echo "BLOCKED: Destructive operation targeting system directory."; exit 2; }
echo "$CHECK" | grep -qEi 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(/|~|\$HOME|\$USERPROFILE)\s*$' && {
  echo "BLOCKED: Recursive delete on root or home directory."; exit 2; }

# Raw disk / partition
echo "$CHECK" | grep -qEi '\b(mkfs|fdisk|parted)\b|dd\s+if=' && {
  echo "BLOCKED: Raw disk or partition operation."; exit 2; }

# System control
echo "$CHECK" | grep -qEi '\b(shutdown|reboot|init\s+[06]|halt|poweroff)\b' && {
  echo "BLOCKED: System shutdown/reboot command."; exit 2; }

# Fork bomb
echo "$CHECK" | grep -qF '(){' && echo "$CHECK" | grep -qF '|' && echo "$CHECK" | grep -qF '&' && {
  echo "BLOCKED: Possible fork bomb pattern."; exit 2; }

# Piped remote execution
echo "$CHECK" | grep -qEi '(curl|wget)\s+.*\|\s*(ba)?sh' && {
  echo "BLOCKED: Piped remote code execution (curl|sh)."; exit 2; }

# Database destruction
echo "$CHECK" | grep -qEi 'DROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b' && {
  echo "BLOCKED: Destructive SQL operation."; exit 2; }

# Docker mass destruction
echo "$CHECK" | grep -qEi 'docker\s+(system\s+prune\s+-a|rm\s+-f\s+\$\(docker\s+ps)' && {
  echo "BLOCKED: Mass Docker destruction."; exit 2; }

# Kubernetes namespace destruction
echo "$CHECK" | grep -qEi 'kubectl\s+delete\s+(namespace|ns)\b' && {
  echo "BLOCKED: Kubernetes namespace deletion."; exit 2; }

# Critical service manipulation
echo "$CHECK" | grep -qEi 'systemctl\s+(stop|disable|mask)\s+(sshd|docker|NetworkManager|firewalld|ufw)' && {
  echo "BLOCKED: Critical system service manipulation."; exit 2; }

# Git destructive operations on main/master
echo "$CHECK" | grep -qEi 'git\s+push\s+.*--force.*\s+(main|master)\b' && {
  echo "BLOCKED: Force push to main/master."; exit 2; }

# === SOFT WARN: Out-of-bounds file operations ===

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$PROJECT_ROOT" ]; then
  # Check for write/delete operations targeting absolute paths outside project
  for target in $(echo "$CHECK" | grep -oE '(rm|mv|cp|chmod|chown)\s+[^|;&]*' | grep -oE '(/[a-zA-Z][a-zA-Z0-9_./-]+|[A-Z]:\\[^ ]+)'); do
    case "$target" in
      /dev/null|/tmp/*|rm|mv|cp|chmod|chown|-*) continue ;;
    esac
    # Normalize and compare to project root
    if [[ "$target" != "$PROJECT_ROOT"* ]] && [[ "$target" != /tmp/* ]]; then
      echo "WARNING: Operation targets path outside project root: $target"
    fi
  done
fi

exit 0
