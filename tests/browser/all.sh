#!/usr/bin/env bash
# Runs the browser suites (tests/browser/*.mjs) against the real app in headless Chromium, each on a fresh browser
# profile (no cached modules, no leftover storage). Starts a static server for the repo if none is answering.
#
#   tests/browser/all.sh                 every suite (about 20 minutes; the soak alone is ~5)
#   tests/browser/all.sh debrief rejoin  just those (names = file names without .mjs; "crash" too)
#
# Needs: Node 22+ (built-in WebSocket), Chromium, Python 3, curl, coreutils timeout. Settings (all optional):
#   NS_BASE      site URL                 default http://localhost:8765 (a server is started there if needed)
#   NS_CDP_PORT  DevTools port            default 9333 (the crash suite uses NS_CRASH_PORT, default 9334)
#   NS_CHROMIUM  browser binary           default chromium
#   NS_OUT       logs, screenshots, profiles   default tests/browser/.out (gitignored)
# Exit code 0 only if every suite passed. Each suite's full output is in $NS_OUT/<suite>.log.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${NS_OUT:-$HERE/.out}"
BASE="${NS_BASE:-http://localhost:8765}"
CDP_PORT="${NS_CDP_PORT:-9333}"
CHROMIUM="${NS_CHROMIUM:-chromium}"
PROFILE="$OUT/profile"
SUITES=(tour programs library-generate instructor-flow cases guided-builder patient-tags task-timers drafts away-break debrief reflection projector run-again rejoin soak crash)
[ $# -gt 0 ] && SUITES=("$@")
export NS_BASE="$BASE" NS_CDP_PORT="$CDP_PORT" NS_CHROMIUM="$CHROMIUM"

command -v node >/dev/null || { echo "node not found"; exit 2; }
command -v "$CHROMIUM" >/dev/null || { echo "$CHROMIUM not found (set NS_CHROMIUM)"; exit 2; }
mkdir -p "$OUT"

# Static server for the repo (only if nothing answers at NS_BASE).
SERVER_PID=""
if ! curl -s -o /dev/null "$BASE/index.html"; then
  PORT="${BASE##*:}"; PORT="${PORT%%/*}"
  python3 -m http.server "$PORT" --directory "$REPO" >"$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/index.html" && break; sleep 0.25; done
  echo "started a static server for $REPO at $BASE"
fi

# Stop every Chromium using our profile (matched by its own executable, never by a pattern that matches this shell).
kill_browser() {
  for sig in TERM KILL; do
    for p in $(pgrep -f -- "$PROFILE" 2>/dev/null); do
      case "$(basename "$(readlink "/proc/$p/exe" 2>/dev/null)")" in chromium|chrome|chromium-browser) kill "-$sig" "$p" 2>/dev/null ;; esac
    done
    sleep 1
  done
}
cleanup() { kill_browser; [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

fresh_browser() {
  kill_browser
  rm -rf "$PROFILE"
  "$CHROMIUM" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$PROFILE" --window-size=1400,1000 about:blank >/dev/null 2>&1 &
  for _ in $(seq 1 40); do
    WS=$(curl -s "http://localhost:$CDP_PORT/json" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const t=JSON.parse(s).find(x=>x.type==='page');process.stdout.write(t?t.webSocketDebuggerUrl:'')}catch{}})")
    [ -n "$WS" ] && break
    sleep 0.25
  done
  [ -n "$WS" ] && node "$HERE/warm.mjs" "$WS" >/dev/null 2>&1
}

declare -a RESULTS
FAILED=0
for s in "${SUITES[@]}"; do
  [ -f "$HERE/$s.mjs" ] || { echo "no such suite: $s"; FAILED=1; RESULTS+=("FAIL $s (missing)"); continue; }
  echo "===== $s"
  if [ "$s" = crash ]; then
    kill_browser
    rm -rf "$OUT/crash-profile"
    timeout 600 node "$HERE/crash.mjs" "$OUT/crash-profile" 2>&1 | tee "$OUT/$s.log" | cut -c1-220
  else
    fresh_browser
    if [ -z "${WS:-}" ]; then echo "browser did not start"; RESULTS+=("FAIL $s (no browser)"); FAILED=1; continue; fi
    timeout 600 node "$HERE/$s.mjs" "$WS" "$OUT/shots/$s" 2>&1 | tee "$OUT/$s.log" | cut -c1-220
  fi
  code=${PIPESTATUS[0]}
  if [ "$code" -eq 0 ]; then RESULTS+=("PASS $s"); else RESULTS+=("FAIL $s (exit $code$([ "$code" -eq 124 ] && echo ', timed out'))"); FAILED=1; fi
done

echo; echo "===== summary"; printf '%s\n' "${RESULTS[@]}"
exit $FAILED
