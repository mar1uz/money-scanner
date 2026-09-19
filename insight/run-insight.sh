#!/bin/bash
# JEV Insight executor - runs in the trusted host context (user LaunchAgent),
# OUTSIDE the connector sandbox. The bridge (Instinct/Hermes connector) is not
# allowed to read .env files, so this executor sources the AI Gateway key from
# jev-router/.env.local with Marius's own file permissions and runs the fixed
# insight pipeline.
#
# Hard rules:
# - One fixed pipeline only: node scripts/jev-insight.mjs. No arbitrary shell,
#   no arguments are taken from request files (they are pure triggers).
# - The key is loaded into the process environment only; it is never printed,
#   logged, copied, or written anywhere.
# - Full audit trail in insight/audit.log; machine status in insight/last-run.json.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/antigravity/Money Scanner"
ENV_FILE="$HOME/antigravity/jev-router/.env.local"
DIR="$REPO/insight"
REQ_DIR="$DIR/requests"
AUDIT="$DIR/audit.log"
STATUS="$DIR/last-run.json"
LOCK="$DIR/.lock"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$AUDIT"; }

write_status() { # mode exit_code report_status
  cat > "$STATUS" <<JSON
{"mode":"$1","exit_code":$2,"report_status":"$3","finished":"$(date -u '+%Y-%m-%dT%H:%M:%SZ')"}
JSON
}

run_pipeline() { # mode extra_args...
  local mode="$1"; shift
  cd "$REPO" || { log "FAIL repo-missing"; write_status "$mode" 1 "repo-missing"; return 1; }
  node scripts/jev-insight.mjs "$@" >> "$DIR/last-run.log" 2>&1
  local rc=$?
  local rstatus="unknown"
  local latest
  latest=$(ls -t "$REPO"/tmp/insights/jev-insight-*.json 2>/dev/null | head -1)
  if [ -n "$latest" ]; then
    rstatus=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('status','unknown'))" "$latest" 2>/dev/null || echo unknown)
  fi
  write_status "$mode" "$rc" "$rstatus"
  log "$mode exit=$rc report_status=$rstatus"
  return $rc
}

case "${1:-}" in
  --run)
    mkdir "$LOCK" 2>/dev/null || { log "SKIP already-running"; exit 0; }
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT
    # Request files are pure triggers. Only two allowlisted name prefixes decide
    # the fixed mode; everything else is deleted and audited, never read.
    shopt -s nullglob
    modes=()
    for req in "$REQ_DIR"/*; do
      base=$(basename "$req")
      case "$base" in
        reclaim|reclaim-*) modes+=("reclaim") ;;
        run|run-*) modes+=("default") ;;
        *) log "IGNORED bad-request-name $base" ;;
      esac
      rm -f "$req"
    done
    [ ${#modes[@]} -eq 0 ] && modes=("default")
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE" 2>/dev/null
    set +a
    if [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
      log "FAIL gateway-key-unreadable (host .env.local missing or unreadable)"
      write_status "scheduled-or-requested" 1 "blocked:no-ai-gateway-key"
      exit 1
    fi
    rc=0
    for mode in $(printf '%s\n' "${modes[@]}" | sort -u); do
      if [ "$mode" = "reclaim" ]; then
        if [ -f "$REPO/tmp/scans/reclaim-latest.json" ]; then
          run_pipeline "requested-reclaim" --scan tmp/scans/reclaim-latest.json || rc=$?
        else
          log "FAIL reclaim-scan-missing (tmp/scans/reclaim-latest.json)"
          rc=1
        fi
      else
        run_pipeline "scheduled-or-requested" || rc=$?
      fi
    done
    exit $rc
    ;;
  --dry-run)
    cd "$REPO" || { echo "repo missing: $REPO"; exit 1; }
    echo "node=$(command -v node) $(node -v 2>/dev/null)"
    echo "script=$(ls scripts/jev-insight.mjs 2>/dev/null || echo MISSING)"
    echo "env-file-present=$([ -f "$ENV_FILE" ] && echo yes || echo no)"
    node scripts/jev-insight.mjs --no-llm > "$DIR/dry-run.log" 2>&1
    rc=$?
    echo "dry-run exit=$rc (deterministic packet only, no LLM, no key needed)"
    tail -3 "$DIR/dry-run.log"
    ;;
  --status)
    cat "$STATUS" 2>/dev/null || echo '{"status":"no-runs-yet"}'
    ;;
  *) echo "usage: run-insight.sh --run|--dry-run|--status"; exit 2 ;;
esac
