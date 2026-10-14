#!/usr/bin/env bash
# Runner for ./host-isolation.test.cjs — proves `styles.css` leaves the host
# <html> element's computed `color-scheme` untouched (H1-H3) while ui component
# roots still get the scheme (P1-P3). Real Chromium, computed style, no server
# and no build: pages are built with page.setContent inlining the stylesheet.
#
#   pnpm test:host-isolation                    # docker mode (CI-portable)
#   HOST_BROWSER=1 pnpm test:host-isolation     # host chromium, no docker
#
# Modes (the run prints `== mode: docker|host`):
#   docker — image mcr.microsoft.com/playwright:v1.60.0-noble, playwright-core
#            mounted read-only. NOTE: a bind mount of a devcontainer path
#            resolves on the docker HOST and can arrive empty.
#   host   — HOST_BROWSER=1: chromium from ~/.cache/ms-playwright (newest
#            chromium-*/chrome-linux64/chrome, override with CHROME=).
#
# Knobs: HOST_BROWSER, CHROME, PW_CORE, PW_VERSION, PW_IMAGE, EXPECTED_TESTS,
# CSS_FILE — the stylesheet under test (default $PKG/src/styles.css, the file
# `./styles.css` exports); point it at `git show <base>:src/styles.css` to
# prove the guards fail before the change. Writes only inside its own mktemp -d.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
PW_VERSION="${PW_VERSION:-1.60.0}"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
CSS_FILE="${CSS_FILE:-$PKG/src/styles.css}"
# One top-level test() each: H1 H2 H3 P1 P2 P3. A verdict is REFUSED unless
# exactly this many ran.
EXPECTED_TESTS="${EXPECTED_TESTS:-6}"

fatal() {
  echo "FATAL: $*"
  exit 3
}

[ -f "$CSS_FILE" ] || fatal "no stylesheet at $CSS_FILE"
PW_CORE="${PW_CORE:-$PKG/node_modules/playwright-core}"
[ -d "$PW_CORE" ] || fatal "no playwright-core at $PW_CORE — run pnpm install in $PKG"

W="$(mktemp -d)"
MAIN_PID=$$
cleanup() { [ "$BASHPID" = "$MAIN_PID" ] && rm -rf "$W"; }
trap cleanup EXIT
cp "$CSS_FILE" "$W/styles.css"
cp "$HERE/host-isolation.test.cjs" "$W/tests.cjs"
tap="$W/tap.txt"

if [ "${HOST_BROWSER:-}" = 1 ]; then
  echo "== mode: host"
  CHROME="${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)}"
  [ -n "$CHROME" ] && [ -x "$CHROME" ] || fatal "no host chromium (set CHROME=)"
  echo "== css: $CSS_FILE · chrome: $CHROME · playwright-core: $PW_CORE"
  CSS_FILE="$W/styles.css" CHROME="$CHROME" PW_CORE_MOUNT="$PW_CORE" node --test \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination="$tap" "$W/tests.cjs"
  rc="$?"
else
  echo "== mode: docker"
  command -v docker >/dev/null 2>&1 || fatal "docker is required (or HOST_BROWSER=1)"
  docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || fatal "image $PW_IMAGE is not present — docker pull $PW_IMAGE"
  echo "== css: $CSS_FILE · image: $PW_IMAGE · playwright-core: $PW_CORE"
  docker run --rm -v "$W":/w -v "$PW_CORE":/pw:ro -w /w \
    -e CSS_FILE=/w/styles.css -e PW_CORE_MOUNT=/pw "$PW_IMAGE" node --test \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination=/w/tap.txt /w/tests.cjs
  rc="$?"
fi
[ -f "$tap" ] || { echo "DID NOT RUN: no TAP output (node exit $rc)"; exit 3; }

count() { { grep -oE "^# $1 [0-9]+" "$tap" || true; } | head -1 | { grep -oE '[0-9]+$' || true; }; }
tests="$(count tests)"
fails="$(count fail)"
passes="$(count pass)"
echo
if [ -z "$tests" ] || [ -z "$fails" ] || [ "$tests" != "$EXPECTED_TESTS" ]; then
  echo "DID NOT RUN: expected $EXPECTED_TESTS tests, TAP reported tests='${tests:-<none>}' pass='${passes:-<none>}' fail='${fails:-<none>}' (node exit $rc)"
  exit 3
fi
if [ "$fails" != 0 ]; then
  echo "RED: $fails of $tests host-isolation tests failed (css=$CSS_FILE)"
  { grep -E '^not ok' "$tap" || true; }
  exit 1
fi
echo "GREEN: $passes/$tests host-isolation tests pass (css=$CSS_FILE)"
exit 0
