#!/bin/bash
WARNINGS=""
DIR="${CLAUDE_PROJECT_DIR:-.}"
for path in "bin/scaffold.js" "src/scaffold-agent.md" "src/skills/pre-start-context.md" "src/skills/post-start-validation.md" "package.json" "README.md"; do
  [ ! -f "$DIR/$path" ] && WARNINGS="${WARNINGS}  DRIFT: $path not found\n"
done
# Check global agent is synced
if [ -f "$HOME/.claude/agents/scaffold-project.md" ]; then
  LOCAL=$(md5sum "$DIR/src/scaffold-agent.md" 2>/dev/null | cut -d' ' -f1)
  GLOBAL=$(md5sum "$HOME/.claude/agents/scaffold-project.md" 2>/dev/null | cut -d' ' -f1)
  [ "$LOCAL" != "$GLOBAL" ] && WARNINGS="${WARNINGS}  DRIFT: Global agent out of sync with src/scaffold-agent.md — run: cp src/scaffold-agent.md ~/.claude/agents/scaffold-project.md\n"
fi
[ -n "$WARNINGS" ] && echo -e "DRIFT DETECTED:\n$WARNINGS"
exit 0
