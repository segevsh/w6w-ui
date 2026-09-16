#!/usr/bin/env bash
# Runner for ./picker-paging-guards.test.cjs — T2.1.1 A2/C2: the bounded
# paged-picker's real-browser behavior (search/category/load-more/
# cancellation/malformed/repeated-cursor) against a synthetic 2,000-app
# catalog. Mirrors `test/picker-layout/run.sh`'s shape exactly: real
# components, bundled from source, mounted via a plain `<W6WUIProvider
# api={...}>` stub (this harness's `listAppsPage`/`listAppsByIds` implement
# real pagination/search math over an in-memory catalog — no jsdom, no real
# network, the same "the stub IS the API surface" mechanic picker-layout
# already pins).
#
#   bash test/picker-paging/run.sh
#   ENGINE=firefox bash test/picker-paging/run.sh
#
# Prerequisites (all local, no network):
#   - docker, and the image below (docker pull mcr.microsoft.com/playwright:v1.60.0-noble)
#   - packages/ui/node_modules, including its OWN declared devDependency
#     playwright-core@1.60.0
#
# Knobs: ENGINE, PW_CORE, PW_VERSION, PW_IMAGE, ESBUILD, EXPECTED_TESTS, and
# UI_SRC — point that at a copy of `src` to run the tests against a tree other
# than this checkout's (how this gate is mutation-tested without dirtying the
# shared working tree).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
SRC="${UI_SRC:-$PKG/src}"
ENGINE="${ENGINE:-chromium}"
PW_VERSION="${PW_VERSION:-1.60.0}"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
# One top-level test per named case in picker-paging-guards.test.cjs — see
# that file's header. Refused unless exactly this many ran: a tree that fails
# to bundle, or a run that dies half-way, reports DID NOT RUN, not "0 failures".
EXPECTED_TESTS="${EXPECTED_TESTS:-11}"

fatal() {
  echo "FATAL: $*"
  exit 2
}

[ -d "$SRC" ] || fatal "no source tree at $SRC"
[ -f "$SRC/AppPicker.tsx" ] || fatal "$SRC does not look like packages/ui's src/ (no AppPicker.tsx)"
[ -f "$SRC/StepBuilderModal.tsx" ] || fatal "$SRC does not look like packages/ui's src/ (no StepBuilderModal.tsx)"
command -v docker >/dev/null 2>&1 || fatal "docker is required to run a real browser"
docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || fatal "image $PW_IMAGE is not present — docker pull $PW_IMAGE"

# `<dialog>`'s built-in top-layer promotion means its rendered position/size
# are meaningless without real CSS — PG9's outside-click dismissal depends on
# `Modal.tsx`'s own bounding-rect check, which only behaves correctly once
# the dialog is actually laid out the way the app really ships it. Same
# sibling requirement as `test/picker-layout/run.sh`.
STUDIO_CSS="$PKG/../studio/src/styles.css"
[ -f "$STUDIO_CSS" ] || fatal "no $STUDIO_CSS — packages/studio must be checked out as a sibling"

ESBUILD="${ESBUILD:-$({ find "$PKG/node_modules/.pnpm" -maxdepth 5 -path '*/esbuild/bin/esbuild' -type f 2>/dev/null || true; } | head -1)}"
[ -n "$ESBUILD" ] || fatal "no esbuild binary under $PKG/node_modules/.pnpm — run pnpm install in $PKG"

PW_CORE="${PW_CORE:-$PKG/node_modules/playwright-core}"
[ -d "$PW_CORE" ] || fatal "no playwright-core at $PW_CORE — run: pnpm add -D playwright-core@${PW_VERSION} (from $PKG)"

W="$(mktemp -d)"
MAIN_PID=$$
cleanup() { [ "$BASHPID" = "$MAIN_PID" ] && rm -rf "$W"; }
trap cleanup EXIT

echo "== source under test: $SRC"
echo "== engine: $ENGINE · image: $PW_IMAGE · playwright-core: $PW_CORE"

mkdir -p "$W/tree/src"
cp -a "$SRC/." "$W/tree/src/"
cp "$HERE/harness-entry.tsx" "$W/tree/src/__picker_paging_entry.tsx"

[ -d "$PKG/node_modules" ] || fatal "missing $PKG/node_modules — run pnpm install in $PKG"
ln -sfn "$PKG/node_modules" "$W/tree/node_modules"

"$ESBUILD" "$W/tree/src/__picker_paging_entry.tsx" --bundle --loader:.tsx=tsx --loader:.ts=ts \
  --jsx=automatic --jsx-import-source=react --format=iife --log-level=warning \
  --outfile="$W/bundle.js" --define:process.env.NODE_ENV='"development"'
[ -s "$W/bundle.js" ] || { echo "DID NOT RUN: the tree at $SRC does not bundle"; exit 3; }

# ui.css compiled from the SCSS source (never the possibly-stale generated
# `styles.css`), then studio.css — same load order as studio/src/main.tsx,
# mirroring `test/picker-layout/run.sh` exactly.
if [ -f "$SRC/styles.scss" ]; then
  "$PKG/node_modules/.bin/sass" --no-source-map --style=expanded "$SRC/styles.scss" "$W/ui.css"
else
  cp "$SRC/styles.css" "$W/ui.css"
fi
cp "$STUDIO_CSS" "$W/studio.css"

cp "$HERE/picker-paging-guards.test.cjs" "$W/tests.cjs"
tap="$W/tap.txt"
docker run --rm -v "$W":/w -v "$PW_CORE":/pw:ro -w /w \
  -e ENGINE="$ENGINE" -e PW_CORE_MOUNT=/pw \
  "$PW_IMAGE" node --test \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=tap --test-reporter-destination=/w/tap.txt \
  /w/tests.cjs
docker_rc="$?"
[ -f "$tap" ] || { echo "DID NOT RUN: the test process produced no TAP output (node exit $docker_rc)"; exit 3; }

count() { { grep -oE "^# $1 [0-9]+" "$tap" || true; } | head -1 | { grep -oE '[0-9]+$' || true; }; }
tests="$(count tests)"
fails="$(count fail)"
passes="$(count pass)"
echo
if [ -z "$tests" ] || [ -z "$fails" ] || [ "$tests" != "$EXPECTED_TESTS" ]; then
  echo "DID NOT RUN: expected $EXPECTED_TESTS tests, TAP reported tests='${tests:-<none>}'" \
    "pass='${passes:-<none>}' fail='${fails:-<none>}' (node exit $docker_rc)"
  echo "  -> this is NOT a pass and NOT a survivor: the run itself did not complete."
  exit 3
fi
if [ "$fails" != 0 ]; then
  echo "RED: $fails of $tests picker-paging guard tests failed (engine=$ENGINE, source=$SRC)"
  { grep -E '^not ok' "$tap" || true; }
  exit 1
fi
echo "GREEN: $passes/$tests picker-paging guard tests pass (engine=$ENGINE, source=$SRC)"
exit 0
