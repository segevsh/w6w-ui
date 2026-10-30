#!/usr/bin/env bash
# Runner for ./foreach-loop-guards.test.cjs — the For each authoring flow
# (legacy load, problems + fixes, the Current-item picker, a refused connect, the
# per-iteration run log) in the REAL editor, compiled from source, in real
# Chromium. jsdom performs no layout or hit-testing, so a rect/drag relation
# (G1's edge start vs. the Each item handle, G4's real pointer drag) passes there
# on a broken tree.
#
#   pnpm test:foreach-loop                         # from packages/ui
#   UI_SRC=/path/to/mutated/src pnpm test:foreach-loop
#
# What it does: copies the source tree into a scratch dir, symlinks in the
# checkout's own node_modules, bundles harness-entry.tsx with esbuild, compiles the
# stylesheet (xyflow's included) from SCSS, and runs the tests in a browser inside
# the Playwright image. It writes ONLY inside its own mktemp -d and the container
# is --rm: no service, DB or checkout is touched, so it is safe to re-run.
#
# Prerequisites (all local, no network):
#   - docker + the image below (docker pull mcr.microsoft.com/playwright:v1.60.0-noble),
#     unless HOST_BROWSER=1
#   - packages/ui/node_modules, including its declared devDependency
#     playwright-core@1.60.0
#
# HOST_BROWSER=1 runs `node --test` on THIS host against a playwright-core and
# the browser Playwright installed under ~/.cache/ms-playwright, instead of
# inside the image. Inside the devcontainer a `docker run -v` bind mount resolves
# on the HOST filesystem, not in this container, so the scratch dir mounted
# above would be empty there — use HOST_BROWSER=1 (and PW_CORE=<path to a
# playwright-core>) in that case. Same knob studio's test/page-guards/run-*.sh carry.
#
# Knobs: ENGINE, PW_CORE, PW_VERSION, PW_IMAGE, ESBUILD, EXPECTED_TESTS,
# HOST_BROWSER, UI_SRC (a copy of `src` to run against — how the guards are
# mutation-tested without dirtying a shared working tree).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
SRC="${UI_SRC:-$PKG/src}"
ENGINE="${ENGINE:-chromium}"
PW_VERSION="${PW_VERSION:-1.60.0}"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
HOST_BROWSER="${HOST_BROWSER:-0}"
# One top-level test() per entry: G1 legacy load, G2 problems + fixes, G3 picker,
# G4 refusal, G5 run log. The verdict below is REFUSED unless exactly this many
# ran: a tree that fails to bundle, or a run that dies half-way, reports
# DID NOT RUN rather than "0 failures".
EXPECTED_TESTS="${EXPECTED_TESTS:-5}"

fatal() {
  echo "FATAL: $*"
  exit 2
}

[ -d "$SRC" ] || fatal "no source tree at $SRC"
[ -f "$SRC/WorkflowFlowEditor.tsx" ] || fatal "$SRC does not look like packages/ui's src/ (no WorkflowFlowEditor.tsx)"
[ -f "$SRC/flow-loop.ts" ] && [ -f "$SRC/flow-problems.ts" ] || fatal "$SRC lacks flow-loop.ts or flow-problems.ts — the For each authoring work is not applied"
if [ "$HOST_BROWSER" != 1 ]; then
  command -v docker >/dev/null 2>&1 || fatal "docker is required unless HOST_BROWSER=1"
  docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || fatal "image $PW_IMAGE is not present — docker pull $PW_IMAGE"
fi

ESBUILD="${ESBUILD:-$({ find "$PKG/node_modules/.pnpm" -maxdepth 5 -path '*/esbuild/bin/esbuild' -type f 2>/dev/null || true; } | head -1)}"
[ -n "$ESBUILD" ] || fatal "no esbuild binary under $PKG/node_modules/.pnpm — run pnpm install in $PKG"

# Resolved from THIS package's own node_modules only — never scanned for under
# the caller's home directory, so a stray unrelated copy cannot make the gate
# "work by accident".
PW_CORE="${PW_CORE:-$PKG/node_modules/playwright-core}"
[ -d "$PW_CORE" ] || fatal "no playwright-core at $PW_CORE — run: pnpm add -D playwright-core@${PW_VERSION} (from $PKG)"
[ -d "$PKG/node_modules" ] || fatal "missing $PKG/node_modules — run pnpm install in $PKG"

W="$(mktemp -d)"
MAIN_PID=$$
# SHOT_DIR — when set, any *.png a guard writes into its workdir is copied out
# before the workdir is removed, so "is the note really above the section?" can
# be answered by LOOKING, not only by an assertion.
cleanup() {
  if [ "$BASHPID" = "$MAIN_PID" ]; then
    if [ -n "${SHOT_DIR:-}" ]; then
      mkdir -p "$SHOT_DIR" 2>/dev/null || true
      cp "$W"/*.png "$SHOT_DIR"/ 2>/dev/null || true
    fi
    rm -rf "$W"
  fi
}
trap cleanup EXIT

echo "== source under test: $SRC"
echo "== engine: $ENGINE · host-browser: $HOST_BROWSER · image: $PW_IMAGE · playwright-core: $PW_CORE"

mkdir -p "$W/tree/src"
cp -a "$SRC/." "$W/tree/src/"
cp "$HERE/harness-entry.tsx" "$W/tree/src/__foreach_loop_entry.tsx"
ln -sfn "$PKG/node_modules" "$W/tree/node_modules"

"$ESBUILD" "$W/tree/src/__foreach_loop_entry.tsx" --bundle --conditions=w6w-source --loader:.tsx=tsx --loader:.ts=ts \
  --jsx=automatic --jsx-import-source=react --format=iife --log-level=warning \
  --outfile="$W/bundle.js" --define:process.env.NODE_ENV='"development"'
[ -s "$W/bundle.js" ] || { echo "DID NOT RUN: the tree at $SRC does not bundle"; exit 3; }

# ui.css is compiled from the SCSS source (styles.build.scss pulls in
# @xyflow/react/dist/style), never copied from the generated styles.css, so the
# harness tests what the partials under src/styles/ currently say.
ENTRY_SCSS="$SRC/styles.build.scss"
[ -f "$ENTRY_SCSS" ] || ENTRY_SCSS="$SRC/styles.scss"
"$PKG/node_modules/.bin/sass" --no-source-map --style=expanded --load-path="$PKG/node_modules" "$ENTRY_SCSS" "$W/ui.css" \
  || { echo "DID NOT RUN: the stylesheet does not compile"; exit 3; }

cp "$HERE/foreach-loop-guards.test.cjs" "$W/tests.cjs"
tap="$W/tap.txt"
# Two reporters: `spec` on the console for a human, `tap` into a file for the
# verdict below — TAP's totals are not reporter-decorated.
if [ "$HOST_BROWSER" = 1 ]; then
  ENGINE="$ENGINE" PW_CORE_MOUNT="$PW_CORE" BUNDLE_DIR="$W" \
    node --test \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination="$tap" \
    "$W/tests.cjs"
  node_rc="$?"
else
  docker run --rm -v "$W":/w -v "$PW_CORE":/pw:ro -w /w \
    -e ENGINE="$ENGINE" -e PW_CORE_MOUNT=/pw -e BUNDLE_DIR=/w \
    "$PW_IMAGE" node --test \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination=/w/tap.txt \
    /w/tests.cjs
  node_rc="$?"
fi
[ -f "$tap" ] || { echo "DID NOT RUN: the test process produced no TAP output (node exit $node_rc)"; exit 3; }

# `|| true` on every count: an unmatched grep exits 1, which must not abort the all-green path.
count() { { grep -oE "^# $1 [0-9]+" "$tap" || true; } | head -1 | { grep -oE '[0-9]+$' || true; }; }
tests="$(count tests)"
fails="$(count fail)"
passes="$(count pass)"
echo
if [ -z "$tests" ] || [ -z "$fails" ] || [ "$tests" != "$EXPECTED_TESTS" ]; then
  echo "DID NOT RUN: expected $EXPECTED_TESTS tests, TAP reported tests='${tests:-<none>}'" \
    "pass='${passes:-<none>}' fail='${fails:-<none>}' (node exit $node_rc)"
  echo "  -> this is NOT a pass and NOT a survivor: the run itself did not complete."
  exit 3
fi
if [ "$fails" != 0 ]; then
  echo "RED: $fails of $tests foreach-loop guard tests failed (engine=$ENGINE, source=$SRC)"
  { grep -E '^not ok' "$tap" || true; }
  exit 1
fi
echo "GREEN: $passes/$tests foreach-loop guard tests pass (engine=$ENGINE, source=$SRC)"
exit 0
