#!/usr/bin/env bash
# Runner for ./expr-template-guards.test.cjs — the chips/template invariants
# no `node --test src/**/*.test.ts` can reach: real typing/paste order and
# caret behaviour in a real contentEditable (jsdom has no caret, so an
# over-eager `paintGen` bump from `onInput` can only be caught by actually
# typing into a browser — G-typing, T-typed, T-paste), whether the render
# chip's sigil is genuinely visually distinct from a var chip's (a jsdom
# assertion on `textContent` can't tell "painted and visible" from "present in
# the DOM tree but never laid out" — G-sigil), whether the render-toggle stays
# opt-in (R4), whether a plain string chips at mount through `valueToParts`
# (T-inline), and whether the Result pane's height is a real proportion of the
# modal, not a pixel hard-code (T-height). This gate mounts the REAL
# `ExpressionEditorModal` / `ExpressionInput`, compiled from source, in real
# Chromium — mirrors `test/picker-layout/`'s mechanics verbatim (copy the
# source tree, symlink in this checkout's own node_modules, bundle with
# esbuild, run in the Playwright image), no third rig invented.
# Runner for ./expr-template-guards.test.cjs — invariants no `node --test
# src/**/*.test.ts` can reach: real typing order in a real contentEditable
# (jsdom has no caret, so an over-eager `paintGen` bump from `onInput` can
# only be caught by actually typing into a browser), whether the render
# chip's sigil is genuinely visually distinct from a var chip's (a
# jsdom/JSDOM assertion on `textContent` can't tell "painted and visible"
# from "present in the DOM tree but never laid out"), and (T1.2.3) whether a
# SECOND real `<dialog>` — the nested "+ Add" modal — actually stacks over
# the editor's own, honours Escape/backdrop scoping, and returns the caret on
# close (jsdom's `<dialog>` shim has no top-layer stacking or focus-restore
# to get wrong in the first place, so none of that is reachable there
# either). This gate mounts the REAL `ExpressionEditorModal`, compiled from
# source, in real Chromium — mirrors `test/picker-layout/`'s mechanics
# verbatim (copy the source tree, symlink in this checkout's own
# node_modules, bundle with esbuild, run in the Playwright image), no third
# rig invented.
#
#   pnpm test:expr-template                    # from packages/ui
#   ENGINE=firefox pnpm test:expr-template      # the same tests in another engine
#
# What it does: copies the source tree into a scratch dir, symlinks in the
# checkout's own node_modules (react/react-dom — everything
# `ExpressionEditorModal`'s import graph actually reaches; nothing is stubbed
# or fabricated — this gate mounts the real component, unlike studio's
# page-guards which fake @w6w/ui), bundles with esbuild, and runs the tests in
# a browser inside the Playwright image. It writes ONLY inside its own
# `mktemp -d` and the container is `--rm`: no service, DB, catalog row or
# checkout is touched, so it is safe to re-run.
#
# Prerequisites (all local, no network):
#   - docker, and the image below (docker pull mcr.microsoft.com/playwright:v1.60.0-noble)
#   - packages/ui/node_modules, including its OWN declared devDependency
#     playwright-core@1.60.0 — this runner resolves it from $PKG/node_modules
#     only; it is never scanned for under the caller's home directory, so a
#     stray unrelated checkout's copy can never make this gate "work by
#     accident" the way it can for an undeclared tool.
#
# Knobs: ENGINE, PW_CORE, PW_VERSION, PW_IMAGE, ESBUILD, EXPECTED_TESTS, and
# UI_SRC — point that at a copy of `src` to run the tests against a tree other
# than this checkout's (how the guards are mutation-tested without dirtying a
# shared working tree — see the project's result for the exact mutants run).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
SRC="${UI_SRC:-$PKG/src}"
ENGINE="${ENGINE:-chromium}"
PW_VERSION="${PW_VERSION:-1.60.0}"
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
# One top-level test() per guard. Pre-existing: G-typing, G-sigil, R4.
# T1.2.2 added T-typed, T-paste, T-inline, T-height (chip-ify hand-typed/pasted
# `{{ }}` and the Result pane's height ratio). T1.4.1 added M-full (the -full
# size modifier actually applying). UNION of both branches' additions — never
# one side's count. A tree that fails to bundle, or a run that dies half-way,
# reports DID NOT RUN rather than "0 failures".
# One top-level test() per guard: G-typing, G-sigil, R4 (chips/template), plus
# T1.2.3's "+ Add" guards — A4 (stacked dialog), A8-escape, A8-backdrop,
# "A7 + A9" (caret returns, no browser dialog invoked), and "A2 + A7"
# (stays-mounted: chips text unchanged, rail gains the new name, + Add still
# rendered). A tree that fails to bundle, or a run that dies half-way, reports
# DID NOT RUN rather than "0 failures".
EXPECTED_TESTS="${EXPECTED_TESTS:-13}"

fatal() {
  echo "FATAL: $*"
  exit 2
}

[ -d "$SRC" ] || fatal "no source tree at $SRC"
[ -f "$SRC/components/ExpressionEditorModal.tsx" ] ||
  fatal "$SRC does not look like packages/ui's src/ (no components/ExpressionEditorModal.tsx)"
command -v docker >/dev/null 2>&1 || fatal "docker is required to run a real browser"
docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || fatal "image $PW_IMAGE is not present — docker pull $PW_IMAGE"

ESBUILD="${ESBUILD:-$({ find "$PKG/node_modules/.pnpm" -maxdepth 5 -path '*/esbuild/bin/esbuild' -type f 2>/dev/null || true; } | head -1)}"
[ -n "$ESBUILD" ] || fatal "no esbuild binary under $PKG/node_modules/.pnpm — run pnpm install in $PKG"

# playwright-core@1.60.0 is a declared devDependency of packages/ui — resolved
# from THIS package's own node_modules only. No home-directory scan.
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
cp "$HERE/harness-entry.tsx" "$W/tree/src/__expr_template_entry.tsx"

# Real react / react-dom — everything ExpressionEditorModal's own import graph
# reaches. One read-only symlink to the checkout's own node_modules; the
# checkout itself is never written to.
[ -d "$PKG/node_modules" ] || fatal "missing $PKG/node_modules — run pnpm install in $PKG"
ln -sfn "$PKG/node_modules" "$W/tree/node_modules"

"$ESBUILD" "$W/tree/src/__expr_template_entry.tsx" --bundle --loader:.tsx=tsx --loader:.ts=ts \
  --jsx=automatic --jsx-import-source=react --format=iife --log-level=warning \
  --outfile="$W/bundle.js" --define:process.env.NODE_ENV='"development"'
[ -s "$W/bundle.js" ] || { echo "DID NOT RUN: the tree at $SRC does not bundle"; exit 3; }

# The stylesheet is <link>ed from the real file, not bundled.
cp "$SRC/styles.css" "$W/ui.css"

cp "$HERE/expr-template-guards.test.cjs" "$W/tests.cjs"
tap="$W/tap.txt"
# Two reporters: `spec` on the console for a human, `tap` into a file for the
# verdict below — the spec reporter's totals are decorated and
# reporter-dependent, TAP's are not.
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
  echo "RED: $fails of $tests expr-template guard tests failed (engine=$ENGINE, source=$SRC)"
  { grep -E '^not ok' "$tap" || true; }
  exit 1
fi
echo "GREEN: $passes/$tests expr-template guard tests pass (engine=$ENGINE, source=$SRC)"
exit 0
