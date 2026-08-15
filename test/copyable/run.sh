#!/usr/bin/env bash
# Runner for ./copyable-guards.test.cjs — the Copyable geometry/leak-defence/
# clipboard invariants (C1-C7) that no `node --test src/**/*.test.ts` can
# reach: jsdom performs no layout (getBoundingClientRect is all zeros, no
# flexbox, no :has()) and implements no Clipboard API at all, so a jsdom test
# would pass on a broken tree. This gate mounts the REAL Copyable/CodeBlock,
# compiled from source, in real Chromium.
#
#   pnpm test:copyable                    # from packages/ui
#   ENGINE=firefox pnpm test:copyable     # the same tests in another engine
#
# Shape copied wholesale from ./test/picker-layout/run.sh (see
# building-blocks.md §3 row 5): copies the source tree into a scratch dir,
# symlinks in the checkout's own node_modules, bundles with esbuild, and runs
# the tests in a browser inside the Playwright image. It writes ONLY inside
# its own mktemp -d and the container is --rm: no service, DB, catalog row or
# checkout is touched, so it is safe to re-run.
#
# TWO things differ from picker-layout, both load-bearing (measured while
# drafting this project's contract):
#   - the origin is `http://localhost:8080`, not `http://<name>.test` — an
#     insecure (non-localhost, non-https) origin has `navigator.clipboard`
#     UNDEFINED in this Playwright image (isSecureContext=false), which makes
#     a genuine clipboard assertion impossible.
#   - the browser context is `browser.newContext()` +
#     `context.grantPermissions(["clipboard-read","clipboard-write"], {origin})`,
#     not a bare `browser.newPage()` — Playwright's clipboard permission
#     defaults to denied, and there is no other grantPermissions precedent in
#     this repo to copy.
#
# Prerequisites (all local, no network):
#   - docker, and the image below (docker pull mcr.microsoft.com/playwright:v1.60.0-noble)
#   - packages/ui/node_modules, including its OWN declared devDependency
#     playwright-core@1.60.0 — this runner resolves it from $PKG/node_modules
#     only.
#
# Knobs: ENGINE, PW_CORE, PW_VERSION, PW_IMAGE, ESBUILD, EXPECTED_TESTS, and
# UI_SRC — point that at a copy of `src` to run the tests against a tree other
# than this checkout's (how the guards are mutation-tested without dirtying a
# shared working tree — see the project's contract, Mutations).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
SRC="${UI_SRC:-$PKG/src}"
ENGINE="${ENGINE:-chromium}"
PW_VERSION="${PW_VERSION:-1.60.0}"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
# One top-level test() per invariant C1-C7. The verdict below is REFUSED
# unless exactly this many ran: a tree that fails to bundle, or a run that
# dies half-way, reports DID NOT RUN rather than "0 failures".
EXPECTED_TESTS="${EXPECTED_TESTS:-9}"

fatal() {
  echo "FATAL: $*"
  exit 2
}

[ -d "$SRC" ] || fatal "no source tree at $SRC"
[ -f "$SRC/CodeBlock.tsx" ] || fatal "$SRC does not look like packages/ui's src/ (no CodeBlock.tsx)"
[ -f "$SRC/components/Copyable.tsx" ] || fatal "$SRC does not look like packages/ui's src/ (no components/Copyable.tsx)"
command -v docker >/dev/null 2>&1 || fatal "docker is required to run a real browser"
docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || fatal "image $PW_IMAGE is not present — docker pull $PW_IMAGE"

STUDIO_CSS="$PKG/../studio/src/styles.css"
[ -f "$STUDIO_CSS" ] || fatal "no $STUDIO_CSS — packages/studio must be checked out as a sibling"

ESBUILD="${ESBUILD:-$({ find "$PKG/node_modules/.pnpm" -maxdepth 5 -path '*/esbuild/bin/esbuild' -type f 2>/dev/null || true; } | head -1)}"
[ -n "$ESBUILD" ] || fatal "no esbuild binary under $PKG/node_modules/.pnpm — run pnpm install in $PKG"

# playwright-core@1.60.0 is a declared devDependency of packages/ui, resolved
# from THIS package's own node_modules only.
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
cp "$HERE/harness-entry.tsx" "$W/tree/src/__copyable_entry.tsx"

# Real react / react-dom / prism-react-renderer — everything CodeBlock's own
# import graph reaches. Nothing is stubbed or fabricated: this gate mounts
# the real components. One read-only symlink to the checkout's own
# node_modules; the checkout itself is never written to.
[ -d "$PKG/node_modules" ] || fatal "missing $PKG/node_modules — run pnpm install in $PKG"
ln -sfn "$PKG/node_modules" "$W/tree/node_modules"

"$ESBUILD" "$W/tree/src/__copyable_entry.tsx" --bundle --loader:.tsx=tsx --loader:.ts=ts \
  --jsx=automatic --jsx-import-source=react --format=iife --log-level=warning \
  --outfile="$W/bundle.js" --define:process.env.NODE_ENV='"development"'
[ -s "$W/bundle.js" ] || { echo "DID NOT RUN: the tree at $SRC does not bundle"; exit 3; }

# Stylesheets are <link>ed from the real files, not bundled — ui.css first,
# then studio.css, matching studio/src/main.tsx's load order, so the
# consumer-layered cascade (studio's unscoped input/textarea rules
# out-specifying nothing here — the whole point of C3) is reproduced rather
# than assumed away. ui.css is compiled from the SCSS source rather than
# copied from the generated styles.css, so the harness tests what the
# partials under src/styles/ currently say and never a stale build artifact.
if [ -f "$SRC/styles.scss" ]; then
  "$PKG/node_modules/.bin/sass" --no-source-map --style=expanded "$SRC/styles.scss" "$W/ui.css"
else
  cp "$SRC/styles.css" "$W/ui.css"
fi
cp "$STUDIO_CSS" "$W/studio.css"

cp "$HERE/copyable-guards.test.cjs" "$W/tests.cjs"
tap="$W/tap.txt"
docker run --rm -v "$W":/w -v "$PW_CORE":/pw:ro -w /w \
  -e ENGINE="$ENGINE" -e PW_CORE_MOUNT=/pw \
  "$PW_IMAGE" node --test \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=tap --test-reporter-destination=/w/tap.txt \
  /w/tests.cjs
docker_rc="$?"
[ -f "$tap" ] || { echo "DID NOT RUN: the test process produced no TAP output (node exit $docker_rc)"; exit 3; }

# The verdict is derived from the TAP totals, and only after the total is confirmed.
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
  echo "RED: $fails of $tests copyable guard tests failed (engine=$ENGINE, source=$SRC)"
  { grep -E '^not ok' "$tap" || true; }
  exit 1
fi
echo "GREEN: $passes/$tests copyable guard tests pass (engine=$ENGINE, source=$SRC)"
exit 0
