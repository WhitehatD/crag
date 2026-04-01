#!/bin/bash
COUNTER_FILE="/tmp/claude-failures-${CLAUDE_SESSION_ID:-$$}"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"
[ "$COUNT" -ge 5 ] && echo "CIRCUIT BREAKER: $COUNT consecutive failures. Change approach."
[ "$COUNT" -ge 3 ] && [ "$COUNT" -lt 5 ] && echo "WARNING: $COUNT consecutive failures."
exit 0
