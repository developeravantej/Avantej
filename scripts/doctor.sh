#!/usr/bin/env bash
# react-doctor wrapper. Scans React apps for issues.
#
# Usage:
#   bun run doctor             scan apps/web + apps/native (full)
#   bun run doctor:web         scan apps/web only
#   bun run doctor:native      scan apps/native only
#   bun run doctor:diff        scan only files changed vs origin/main (matches CI)
#   bun run doctor:fix         scan + print Claude Code fix instructions
set -euo pipefail

MODE="${1:-all}"
DIFF_BASE="${DIFF_BASE:-origin/main}"

scan() {
  local dir="$1"
  shift
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  react-doctor: $dir $*"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  npx -y react-doctor@latest "$dir" --offline --verbose "$@" || EXIT=$?
}

case "$MODE" in
  web)    scan apps/web ;;
  native) scan apps/native ;;
  diff)
    scan apps/web --diff "$DIFF_BASE"
    scan apps/native --diff "$DIFF_BASE"
    ;;
  fix)
    scan apps/web
    scan apps/native
    cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Auto-fix: react-doctor has no --fix flag (diagnostic only).
  Use Claude Code to apply fixes:

    1. Open this repo in Claude Code (or run `claude` in terminal)
    2. Paste prompt:

       Run `bun run doctor` and fix every finding using the
       react-doctor and simplify skills. Apply changes file by
       file, run scan again to confirm score improved.

  Or fix manually using printed diagnostics above.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
    ;;
  all|*)
    scan apps/web
    scan apps/native
    ;;
esac
