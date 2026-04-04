#!/bin/bash
MSDB="/c/Users/alexc/headroom-venv/Scripts/python.exe D:/playground/memstack/db/memstack-db.py"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git diff --stat HEAD 2>/dev/null | tail -1 | sed 's/^ *//')
$MSDB add-insight '{"project":"crag","type":"gotcha","content":"Pre-compaction: branch='"$BRANCH"' uncommitted=['"$UNCOMMITTED"']","source_file":".claude/hooks/pre-compact-snapshot.sh","tags":"compaction,recovery"}' 2>/dev/null
echo "PRE-COMPACT: State saved (branch=$BRANCH)"
exit 0
