#!/usr/bin/env bash
# Clean-consumer smoke for the PACKED @w6w/ui tarball — the one thing that
# proves `npm install @w6w/ui` works from a machine that has none of this
# monorepo: no `link:` override, no sibling core checkout, no `w6w-source`
# condition. A throwaway consumer (React 18 + Vite 6 + TypeScript 5.8) installs
# the tarball, imports every public entry (`@w6w/ui`, `/flow`, `/code`,
# `/styles.css`) plus `@w6w/expr`, and must pass a strict `tsc --noEmit`
# (skipLibCheck OFF, so a broken published .d.ts fails here) and `vite build`.
#
#   UI_TGZ=/path/w6w-ui-0.1.0.tgz bash test/pack-smoke/run.sh
#   EXPR_TGZ=/path/w6w-expr-0.1.0.tgz UI_TGZ=… bash test/pack-smoke/run.sh
#
# UI_TGZ   (required) the `pnpm pack` tarball of this package.
# EXPR_TGZ (optional) an `npm pack` tarball of @w6w/expr. Unset => @w6w/expr
#          comes from the npm registry (the CI path: expr must be published
#          first). Set it to rehearse before expr is on npm.
#
# Writes ONLY inside its own mktemp -d (outside any repo), removed on exit —
# never into this checkout. Needs network (npm registry) for the consumer's
# own dependencies. Exit 0 + last line `PACK-SMOKE OK` on success; exit 3
# "DID NOT RUN" when a precondition is missing; any other non-zero = a real
# failure of the packed tarball.
set -uo pipefail

fatal() { echo "DID NOT RUN: $*" >&2; exit 3; }

[ -n "${UI_TGZ:-}" ] || fatal "UI_TGZ is required (path to the pnpm-packed w6w-ui-*.tgz)"
[ -f "$UI_TGZ" ] || fatal "UI_TGZ=$UI_TGZ is not a file"
if [ -n "${EXPR_TGZ:-}" ]; then
  [ -f "$EXPR_TGZ" ] || fatal "EXPR_TGZ=$EXPR_TGZ is not a file"
fi
command -v npm >/dev/null 2>&1 || fatal "npm is required"
command -v node >/dev/null 2>&1 || fatal "node is required"

UI_TGZ="$(cd "$(dirname "$UI_TGZ")" && pwd)/$(basename "$UI_TGZ")"
[ -z "${EXPR_TGZ:-}" ] || EXPR_TGZ="$(cd "$(dirname "$EXPR_TGZ")" && pwd)/$(basename "$EXPR_TGZ")"

W="$(mktemp -d)"
MAIN_PID=$$
cleanup() {
  if [ "$BASHPID" = "$MAIN_PID" ]; then rm -rf "$W"; fi
}
trap cleanup EXIT

mkdir -p "$W/app/src"
cd "$W/app" || fatal "cannot enter scratch dir"

cat > package.json <<'JSON'
{ "name": "pack-smoke-consumer", "private": true, "version": "0.0.0", "type": "module" }
JSON

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
JSON

cat > vite.config.ts <<'TS'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [react()] });
TS

cat > index.html <<'HTML'
<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
HTML

cat > src/main.tsx <<'TSX'
import { ConfirmModal, W6WUIProvider } from "@w6w/ui";
import { WorkflowFlowEditor } from "@w6w/ui/flow";
import { CodeBlock } from "@w6w/ui/code";
import "@w6w/ui/styles.css";
import { evaluate } from "@w6w/expr";
import { createRoot } from "react-dom/client";

// Touch every entry so neither tsc nor Rollup can drop an import.
export const probe = { ConfirmModal, W6WUIProvider, WorkflowFlowEditor, CodeBlock, evaluate };
const el = document.getElementById("root");
if (el) createRoot(el).render(<CodeBlock code={String(evaluate({ "+": [1, 2] }, {}))} language="json" />);
TSX

echo "== consumer deps + tarball(s) -> $W/app"
SPECS=("$UI_TGZ")
[ -z "${EXPR_TGZ:-}" ] || SPECS+=("$EXPR_TGZ")
npm install --no-audit --no-fund --loglevel=error \
  react@18 react-dom@18 vite@6 @vitejs/plugin-react@4 typescript@5.8 \
  @types/react@18 @types/react-dom@18 "${SPECS[@]}" \
  || { echo "FAIL: npm install of the consumer" >&2; exit 1; }

# The consumer must have resolved @w6w/expr as a dependency of the tarball, and
# the registry/tarball copy must be a built package (dist), not source.
[ -f node_modules/@w6w/ui/package.json ] || { echo "FAIL: @w6w/ui not installed" >&2; exit 1; }
[ -f node_modules/@w6w/expr/package.json ] || { echo "FAIL: @w6w/expr not installed" >&2; exit 1; }
[ -f node_modules/@w6w/ui/dist/index.mjs ] || { echo "FAIL: installed @w6w/ui has no dist/index.mjs" >&2; exit 1; }

echo "== tsc --noEmit (strict, skipLibCheck: false)"
./node_modules/.bin/tsc --noEmit -p tsconfig.json || { echo "FAIL: consumer typecheck" >&2; exit 1; }

echo "== vite build"
./node_modules/.bin/vite build --logLevel warn || { echo "FAIL: consumer vite build" >&2; exit 1; }
[ -d dist ] && ls dist/assets/*.js >/dev/null 2>&1 || { echo "FAIL: vite build produced no JS" >&2; exit 1; }

echo "PACK-SMOKE OK"
