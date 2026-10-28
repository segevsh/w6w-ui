#!/usr/bin/env bash
# Clean-consumer smoke for the PACKED @w6w/ui tarball — the one thing that
# proves `npm install @w6w/ui` works from a machine that has none of this
# monorepo: no `link:` override, no sibling core checkout, no `w6w-source`
# condition. A throwaway consumer (React 18 + Vite 6, plus a Next 16 / React 19 App Router lane + TypeScript 5.8) installs
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
# SMOKE_KEEP=1 keeps the scratch dir for debugging.
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
  if [ "$BASHPID" = "$MAIN_PID" ]; then if [ -n "${SMOKE_KEEP:-}" ]; then echo "kept $W"; else rm -rf "$W"; fi; fi
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

# Sass-consumer probe: the PUBLISHED styles.scss must compile with no loadPaths/alias.
cat > src/probe.scss <<'SCSS'
@use "@w6w/ui/styles.scss";
.pack-smoke-scss-probe { color: red; }
SCSS

cat > index.html <<'HTML'
<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
HTML

cat > src/main.tsx <<'TSX'
import { ConfirmModal, W6WUIProvider } from "@w6w/ui";
import { WorkflowFlowEditor } from "@w6w/ui/flow";
import { CodeBlock } from "@w6w/ui/code";
import "@w6w/ui/styles.css";
import "./probe.scss";
import { evaluate } from "@w6w/expr";
import { createRoot } from "react-dom/client";

// Touch every entry so neither tsc nor Rollup can drop an import.
export const probe = { ConfirmModal, W6WUIProvider, evaluate };
const workflow = { manifestVersion: "1", id: "smoke", name: "smoke", nodes: [], edges: [] };
const el = document.getElementById("root");
if (el)
  createRoot(el).render(
    <>
      <CodeBlock code={String(evaluate({ "+": [1, 2] }, {}))} language="json" />
      <W6WUIProvider api={{} as never}>
        <WorkflowFlowEditor value={workflow} onChange={() => {}} readOnly />
      </W6WUIProvider>
    </>,
  );
TSX

echo "== consumer deps + tarball(s) -> $W/app"
SPECS=("$UI_TGZ")
[ -z "${EXPR_TGZ:-}" ] || SPECS+=("$EXPR_TGZ")
npm install --no-audit --no-fund --loglevel=error \
  react@18 react-dom@18 vite@6 @vitejs/plugin-react@4 typescript@5.8 \
  @types/react@18 @types/react-dom@18 sass "${SPECS[@]}" \
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

ls dist/assets/*.css >/dev/null 2>&1 || { echo "FAIL: vite build produced no CSS" >&2; exit 1; }
cat dist/assets/*.css | grep -q 'pack-smoke-scss-probe' \
  || { echo "FAIL: Vite lane: .scss probe (@use \"@w6w/ui/styles.scss\") not in built CSS" >&2; exit 1; }
if grep -rEn '@(use|import) +"@xyflow' node_modules/@w6w/ui/src/styles.scss node_modules/@w6w/ui/src/styles/ >/dev/null 2>&1; then
  echo "FAIL: published Sass references @xyflow" >&2; exit 1; fi
[ ! -e node_modules/@w6w/ui/src/styles.build.scss ] || { echo "FAIL: build-only styles.build.scss was published" >&2; exit 1; }
cat dist/assets/*.css | grep -q '\.react-flow{' \
  || { echo "FAIL: Vite lane: built CSS has no .react-flow{ (React Flow base rules missing from @w6w/ui/styles.css)" >&2; exit 1; }

echo "== \"use client\" banner on the six entry files"
for f in index flow code; do
  for e in mjs cjs; do
    FILE="node_modules/@w6w/ui/dist/$f.$e"
    [ -f "$FILE" ] || { echo "FAIL: missing $FILE" >&2; exit 1; }
    FIRST="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8").trimStart();process.stdout.write(s.slice(0,13))' "$FILE")"
    [ "$FIRST" = '"use client";' ] || { echo "FAIL: $FILE does not start with \"use client\" (got: $FIRST)" >&2; exit 1; }
  done
done
# Shared chunks must carry no banner. `vite build` of the library emits entries
# AND shared chunks as flat dist/*.{mjs,cjs,js}; enumerate every non-entry JS file
# and require at least one, so a glob that matches nothing cannot pass vacuously.
SHARED=()
for c in node_modules/@w6w/ui/dist/*.mjs node_modules/@w6w/ui/dist/*.cjs node_modules/@w6w/ui/dist/*.js; do
  [ -f "$c" ] || continue
  case "$(basename "$c")" in index.*|flow.*|code.*) continue ;; esac
  SHARED+=("$c")
done
[ "${#SHARED[@]}" -gt 0 ] || { echo "FAIL: found no shared chunk files in dist/ (enumeration empty)" >&2; exit 1; }
for c in "${SHARED[@]}"; do
  if head -c 40 "$c" | grep -q 'use client'; then echo "FAIL: shared chunk $c carries the banner" >&2; exit 1; fi
done
echo "   ${#SHARED[@]} shared chunk(s) banner-free"

echo "== Next lane (App Router, React 19, next@16.4.1)"
N="$W/next"
mkdir -p "$N/app/editor"
cd "$N" || fatal "cannot enter next dir"
cat > package.json <<'JSON'
{ "name": "pack-smoke-next", "private": true, "version": "0.0.0" }
JSON
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "allowJs": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
JSON
cat > next.config.mjs <<'JS'
export default {};
JS
cat > app/layout.tsx <<'TSX'
import "@w6w/ui/styles.css";
import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
TSX
# SERVER component: no directive, ui entries imported directly, serializable props.
cat > app/page.tsx <<'TSX'
import { ConfirmModal, W6WUIProvider } from "@w6w/ui";
import { CodeBlock } from "@w6w/ui/code";
import type { ComponentProps } from "react";
import { WorkflowFlowEditor, type WorkflowFlowEditorProps } from "@w6w/ui/flow";

const workflow = { manifestVersion: "1", id: "smoke", name: "smoke", nodes: [], edges: [] };
// No call is made during prerender; an empty object is a serializable stand-in for the host's api.
const api = {} as unknown as ComponentProps<typeof W6WUIProvider>["api"];

export default function Page() {
  // Function props cannot cross the RSC boundary; this read-only editor needs none.
  const props = { value: workflow, readOnly: true } as unknown as WorkflowFlowEditorProps;
  return (
    <W6WUIProvider api={api}>
      <CodeBlock code="{}" language="json" />
      <WorkflowFlowEditor {...props} />
      <p>{typeof ConfirmModal}</p>
    </W6WUIProvider>
  );
}
TSX
# Interactive page: itself a client component, imports the editor directly.
cat > app/editor/page.tsx <<'TSX'
"use client";
import { W6WUIProvider } from "@w6w/ui";
import { type FlowWorkflow, WorkflowFlowEditor } from "@w6w/ui/flow";
import { type ComponentProps, useState } from "react";

const api = {} as unknown as ComponentProps<typeof W6WUIProvider>["api"];

export default function EditorPage() {
  const [value, setValue] = useState<FlowWorkflow>({ manifestVersion: "1", id: "smoke", name: "smoke", nodes: [], edges: [] });
  return (
    <W6WUIProvider api={api}>
      <WorkflowFlowEditor value={value} onChange={setValue} />
    </W6WUIProvider>
  );
}
TSX
npm install --no-audit --no-fund --loglevel=error \
  next@16.4.1 react@19 react-dom@19 typescript@5.8 @types/react@19 @types/react-dom@19 @types/node \
  "${SPECS[@]}" \
  || { echo "FAIL: npm install of the Next consumer" >&2; exit 1; }

# No consumer module other than app/editor/page.tsx may carry a client directive
# (a host re-export wrapper is exactly what the banner removes the need for).
WRAP="$(grep -rlE "['\"]use client['\"]" app next.config.mjs 2>/dev/null | sort)"
[ "$WRAP" = "app/editor/page.tsx" ] \
  || { echo "FAIL: consumer files carrying use client: [$WRAP] (expected only app/editor/page.tsx)" >&2; exit 1; }

for BUILDER in turbopack webpack; do
  echo "== next build ($BUILDER)"
  rm -rf .next
  if [ "$BUILDER" = webpack ]; then FLAG=--webpack; else FLAG=""; fi
  NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build $FLAG \
    || { echo "FAIL: next build ($BUILDER)" >&2; exit 1; }
  CSSN="$(find .next/static -name '*.css' | wc -l)"
  [ "$CSSN" -ge 1 ] || { echo "FAIL: next build ($BUILDER) emitted no CSS" >&2; exit 1; }
  find .next/static -name '*.css' -exec cat {} + | grep -q '\.react-flow{' \
    || { echo "FAIL: Next lane ($BUILDER): .next/static CSS has no .react-flow{" >&2; exit 1; }
done

echo "PACK-SMOKE OK"
