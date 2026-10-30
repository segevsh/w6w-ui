# PLANNER.md — read this first when planning work in `w6w-ui`

> Every claim below carries a citation — a `file:line`, or a command plus its output — and this
> file carries its own `verified:` date. Where this doc and the code disagree, **the code wins** —
> and fixing the doc is part of the work, not a favour. See *Maintenance* at the bottom: this file
> is only worth reading if it is true, and the facts it records have already drifted once between
> the intake that first wrote them down and this file's own pickup commit (facts 1 and 3 below).

## Where work happens

Almost every change lands in `src/`, which splits three ways: **30** top-level `.tsx` files (large,
often multi-export modules — e.g. `AppPicker.tsx`, and `StepBuilderModal.tsx`, which bundles
`NodeList`, `CallableList`, `CallableRow` and `ReadyToUseFlow` as sibling functions in one file; see
fact 1 — `find src/ -maxdepth 1 -type f -name '*.tsx' | wc -l`), **30** smaller components under
`src/components/` (`.tsx` files only, excluding `*.stories.tsx` and the `__tests__/` subdir —
`find src/components -maxdepth 1 -type f -name '*.tsx' ! -name '*.stories.tsx' | wc -l`), and
**33** SCSS partials under `src/styles/` that compile into the two committed `.css` bundles (fact 2;
`ls src/styles/_*.scss | wc -l`). All three re-measured on `proj/26-10-12-00-steps-metadata` @
`e6c7c17` and identical on its fork point `main` @ `644be4a` (`git ls-tree --name-only 644be4a
src/`), so the drift from the `15`/`27`/`32` this file used to carry predates that project. `scripts/` holds
three small Node-only build/lint/coverage tools, each documented by its own header docstring — read
the docstring before the script body (`scripts/build-css.mjs:1-21`, `scripts/lint-tokens.mjs:1-29`,
`scripts/coverage-stories.mjs:1-50`). `test/` holds
ten real-browser rigs (`ls test/`, 2026-10-29): eight are `run.sh` rigs, seven of them wired to a
`pnpm test:*` script (`picker-paging` has a `run.sh` but no script — `grep '"test:' package.json`);
`test/html-preview/html-preview-xss.test.ts` and `test/combo-layout/combo-layout.test.ts` are plain
`node --test` files that launch host `playwright-core` Chromium and sit in **no** `package.json`
script (see the *26-10-28-00-updates* section) — all distinct from the
Node-native unit suite under `src/__tests__/` + `src/components/__tests__/` (fact 3). `docs/` is
small and authoritative for two specific surfaces — see the routing table below.

## Which doc to read

| your task touches… | read |
|---|---|
| the spacing/type token scale, which `--w6w-*` custom property to reach for | [`docs/design-system.md`](../docs/design-system.md) |
| light/dark mode, how a host embedding `@w6w/ui` controls the theme | [`docs/theming.md`](../docs/theming.md) |
| the public component API, install/usage patterns | [`README.md`](../README.md) |
| gate commands, the token-lint ratchet, the picker-layout Chromium suite | the *Gate baselines* section below — `packages/ui` is not big enough for a separate testing doc |

## The eight things that bite people who skip this

1. **The shared-class trap.** `.w6w-stepbuilder-item` / `-list` / `-search` are consumed by four
   components and asserted on by one real-browser suite — treat them as **additive-only**.
   Consumers, re-verified at this file's pickup commit: `AppPicker.tsx:403` (`-search`), `:504`
   (`-list`), `:509`/`:520` (`-item`/`-item-main`) — re-grepped at `2cfe66a`, the `loadPage` ref and
   loader branch moved them; `StepBuilderModal.tsx`'s `NodeList` (function at
   `:577`, uses `-list`/`-item` at `:585`/`:590`), `CallableList` (`:861`, `-search`/`-list` at
   `:911`/`:922`), `CallableRow` (`:1567`, `-item`/`--callable` at `:1580`), `ReadyToUseFlow`
   (`:1621`, `-list` at `:1651`). **The single-digit assertion-site count this fact once carried
   does not reproduce** in `test/picker-layout/picker-layout-guards.test.cjs` — recount rather than
   repeat it. Two real counts, both re-measured here, that mean different things:
   - `/usr/bin/grep -cE 'w6w-stepbuilder-(item|list|search)' test/picker-layout/picker-layout-guards.test.cjs`
     → **25** — every raw occurrence of the three class-name strings, including indirect
     `rect()`/`querySelector` helper calls.
   - `/usr/bin/grep -nE 'assert\.(ok|equal)' test/picker-layout/picker-layout-guards.test.cjs | /usr/bin/grep -E 'w6w-stepbuilder-(item|list|search)'`
     → **5** direct `assert.ok`/`assert.equal` calls whose own message string names one of the
     three classes (lines `191`, `239`, `309`, `425`, `980`).

   Neither is "nine." State which count you mean when you cite this trap.

2. **`src/styles.css` (and `src/code.css`) are COMMITTED BUILD OUTPUT, not source.** Authored source
   is `src/styles.scss` + `src/styles/_*.scss`; `scripts/build-css.mjs:1-21`'s own header states the
   rationale verbatim: studio consumes this package as a live `link:../ui` source link with no Sass
   toolchain of its own, so a gitignored artifact would leave a clean checkout with no stylesheet at
   all, and committing keeps every consumer working. `package.json`'s `scripts` wires this in as
   `"build:css": "node scripts/build-css.mjs"` and `"check:css": "node scripts/build-css.mjs
   --check"`. Edit the partial, run `build:css`, commit both files — never hand-merge the generated
   `.css` on a conflict; regenerate instead (`build-css.mjs` is deterministic).

   **verified: 2026-10-14** — `src/styles.css` is compiled from the BUILD-ONLY `src/styles.build.scss`
   (`scripts/build-css.mjs`: `const SOURCE = { styles: "styles.build" }`, `loadPaths: [join(root,
   "node_modules")]`), which `@use`s `"@xyflow/react/dist/style"` and then `"styles"`.
   `styles.build.scss` is not published (build-css.mjs: "build-only (not in package.json `files`)").
   The published `src/styles.scss` and `src/styles/_*.scss` contain NO external `@use` (`grep -rn
   "@use" src/styles.scss src/styles` → only sibling partials), so Sass consumers need no loadPaths
   (pack-smoke's `.scss` probe compiles `@use "@w6w/ui/styles.scss"` with none). `pnpm check:css`
   gates sync. `src/WorkflowFlowEditor.tsx` imports `@xyflow/react` components only, no React Flow CSS
   (`grep -n "import.*css" src/WorkflowFlowEditor.tsx` → none; `src/flow.ts` header: "compiled in from
   `@xyflow/react/dist/style`, so no second import is needed").

3. **`pnpm test` is a TWO-root glob, not a flat one.** `package.json`'s `"test"` script:
   ```
   "test": "node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test --test-concurrency=4 --test-timeout=120000 src/__tests__/*.test.ts src/components/__tests__/*.test.ts"
   ```
   Both roots are real and both matter: `src/__tests__/*.test.ts` (**91** files) and
   `src/components/__tests__/*.test.ts` (**26** files) — `ls src/__tests__/*.test.ts | wc -l` and
   `ls src/components/__tests__/*.test.ts | wc -l` on `proj/26-10-24-02-agents-studio-foundations` @
   `58bccaf` (2026-10-25).
   (`package.json` on `main` @ `f001214`, 2026-10-17.)
   **Test memory (26-10-16-01, BLK-1, 2026-10-17): a failing assertion on a rendered DOM node can take
   down the host.** Node 22.16's `AssertionError` inspects a failing `strictEqual`/`deepStrictEqual`
   operand at depth 1000 and myers-diffs it EVEN WITH a custom message
   (`lib/internal/assert/assertion_error.js:264`). A React-rendered node's `__reactFiber$…` keys reach the
   whole fiber tree and jsdom, and that was measured at ~3.5 GB/s, mostly off-heap, so `--max-old-space-size`
   does not stop it. Two test-only guards now load from `src/test-jsx-loader.mjs`: `test-assert-guard.mjs`
   (inner: an operand reaching >2000 values fails with a bounded message) and `test-guards.mjs` (outer: DOM
   nodes scrubbed to tokens, plus a worker-thread watchdog that SIGKILLs past `W6W_TEST_MAX_RSS_MB`, default
   4096). Both are pinned by `src/__tests__/assert-guard.test.ts`. The `test` script also caps
   `--max-old-space-size=2048 --test-concurrency=4 --test-timeout=120000`: the default concurrency
   (availableParallelism−1 = 23 here) peaked at ~7.5 GB per suite run. Do not remove either import, and never
   run a mutant suite without an RSS-capped, process-group-killing runner.
   **This devcontainer runs Node v22.16.0, so the script needs `NODE_OPTIONS=--experimental-strip-types`.**
   A bare `pnpm test` fails all 77 top-level test files with `ERR_UNKNOWN_FILE_EXTENSION` whatever the
   diff (re-run at `e6c7c17`: `# tests 77 · # fail 77`; studio's `test:unit` needs the same flag). The
   `test` script itself does not set it.
   **Always pass the flag through `NODE_OPTIONS`, never as a `node` CLI argument.** The full command:
   ```
   NODE_OPTIONS=--experimental-strip-types node --import ./src/test-jsx-loader.mjs --test src/__tests__/*.test.ts src/components/__tests__/*.test.ts
   ```
   → **757 pass / 0 fail** at `e6c7c17`. Written as `node --experimental-strip-types --import … --test
   …` instead, the same tree reports **756 / 1 fail**: `flow-utils.test.ts`'s `workflowToFlow
   TERMINATES on a cyclic graph` runs its probe in a child (`spawnSync(process.execPath, …)`), and a
   child inherits `NODE_OPTIONS` but not its parent's CLI flags, so the probe dies on the `.ts`
   import. That one red is the invocation, not the code. `26-10-12-00-steps-metadata`'s evaluators
   used the CLI-flag form and recorded it as a "pre-existing failure" in every eval (its
   `evals/T3.2.4.eval.md` G2, FOLLOWUPS) until the closeout re-ran it the `NODE_OPTIONS` way.
   The trap survives the fix that added the second root: a `.test.ts` file placed in a **third**
   location, or named `.test.tsx`, silently never runs — the loader (`src/test-jsx-loader.mjs:16-20`)
   transpiles `.tsx` on import, but the `--test` arguments above are `.test.ts` globs only, so a
   `.tsx`-named test file is never even discovered. **It happened again:**
   26-10-24-02 added `src/__tests__/AppPicker.provider.test.tsx`, the only `.test.tsx` in the tree
   (`ls src/__tests__/*.test.tsx src/components/__tests__/*.test.tsx`), and `pnpm test` never runs it.
   Run it by hand with `NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import
   ./src/test-jsx-loader.mjs --test src/__tests__/AppPicker.provider.test.tsx` → `tests 5 · pass 5`
   (2026-10-25, `58bccaf`), or rename it to `.test.ts`, as studio did for its pages test (studio
   `4582ca7`).

4. **`test/picker-layout/` is a real-Chromium gate with a pinned test count.**
   `test/picker-layout/run.sh:64`: `EXPECTED_TESTS="${EXPECTED_TESTS:-22}"`; `:161-163` is the
   `DID NOT RUN` (exit 3) branch on a mismatch between that constant and the TAP-reported test
   total — so adding a `test()` to `picker-layout-guards.test.cjs` without bumping the constant
   silently voids the gate rather than reporting a false pass. Recounted at this file's pickup
   commit: `grep -cE '^\s*test\(' test/picker-layout/picker-layout-guards.test.cjs` → exactly **22**,
   still matching the default.

5. **Gate commands that work here, and a caveat that is conditional, not absolute.**
   `./node_modules/.bin/tsc -b --noEmit` and `./node_modules/.bin/biome check .` both run clean from
   an already-installed checkout (see *Gate baselines* below) — these are the same two commands
   `package.json`'s `typecheck` and `lint` scripts wrap. Root `CLAUDE.md:150-153` documents
   that the `pnpm typecheck` / `pnpm lint` wrappers "run a dep-status install check first and can
   hard-fail on ignored build scripts (esbuild/biome) even when the code is fine" — **this is a
   fresh-install condition**, not something that reproduces on every checkout: both `pnpm typecheck`
   and `pnpm lint` were re-run live in this already-installed lane while writing this file and both
   exited clean. It bites a freshly built harness workspace (`pnpm install` just ran, ignored build
   scripts not yet approved); it does not bite a checkout you have already been working in. If the
   wrapper hard-fails, fall back to the two direct binaries above. A second fresh-lane trap: `pnpm
   install` against the shared `/workspaces/w6w/.pnpm-store` fails `EACCES` (its `v10/index/*` holds
   root-owned dirs written from a container); `pnpm install --store-dir
   ~/.local/share/pnpm-store-lane` works (`26-09-29-00-add-server-resources-view`'s RETRO §2 O-1).

6. **Storybook bundles the authored `.scss`, not the compiled `src/styles.css`.**
   `.storybook/preview.tsx` imports `../src/styles.scss`, so a partial edit hot-reloads the canvas.
   The flip side is that editing or mutating `src/styles.css` alone changes nothing in Storybook.
   `26-10-03-00-fixes`'s T3.1.1 evaluator found that its first CSS mutation, made against
   `styles.css`, was a silent no-op (`evals/T3.1.1.eval.md` G4). Mutate or measure the partial, and
   let `check:css` (fact 2) keep the two files in step.

7. **`lint:tokens` must be in the gate list of any contract that adds CSS, and it is a per-file
   COUNT.** `tsc`, `biome`, the unit suite and `check:css` all stay green past a new hard-coded
   literal. `26-10-12-00-steps-metadata`'s T3.2.4 contract left this gate out, and a new
   `gap: 3px` in `.w6w-exprmodal-toggle-stack` shipped red through the developer (round 1). In round
   2 the developer put the `lint-tokens-allow` comment on a *pre-existing* `gap: 3px`
   (`.w6w-exprmodal-group`) instead of the new one. Because the ratchet compares counts per file
   (`scripts/lint-tokens.mjs`'s header), retiring one old entry offset the new one and the gate
   read green (`evals/T3.2.4.eval.md` ROUND 2). The allow-comment now sits on the new rule only
   (`grep -n 'lint-tokens-allow' src/styles/_expression-modal.scss`). When a CSS node touches the
   ratchet, check that the diff to the partial adds lines and removes none
   (`git diff <base> -- src/styles/_<partial>.scss`), and that the allow-comment sits on the line
   the node added. A green exit code alone is not enough.

8. **Headless Chromium on this host is missing its shared libs. Extract them, don't install
   them.** Playwright's `chrome-headless-shell` (`~/.cache/ms-playwright/chromium_headless_shell-1243/`)
   exits 127 on `libnspr4.so`. `ldd …/chrome-headless-shell | grep 'not found'` lists 14 libs
   (`libnspr4`, `libnss3`, `libnssutil3`, `libatk-1.0`, `libatk-bridge-2.0`, `libdbus-1`,
   `libXcomposite`, `libXdamage`, `libXfixes`, `libXrandr`, `libgbm`, `libxkbcommon`, `libasound`,
   `libatspi`). `26-10-12-00-steps-metadata`'s T3.2.2 developer could not run its probe because of
   this. Its evaluators ran it with libs a T3.2.1 evaluator had extracted into the session
   scratchpad (`evals/T3.2.2.eval.md` "Carry-in C1"). The recipe, with nothing installed system-wide:
   `cd <scratch>/debs && apt-get download libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0
   libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libwayland-server0 libx11-6 libxcb1 libxcb-randr0
   libxcomposite1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1
   libxtst6 libasound2`, then `for d in *.deb; do dpkg-deb -x "$d" ../libs; done`, then run with
   `LD_LIBRARY_PATH=<scratch>/libs/usr/lib/x86_64-linux-gnu:<scratch>/libs/lib/x86_64-linux-gnu`.
   With those 22 packages, `ldd` reports 0 missing (re-checked 2026-10-13). Drive it with the
   workspace's `playwright-core` and `executablePath` (see that project's
   `artifacts/T3.2.4-probe.mjs`, under `.ai/projects/done/26-10-12-00-steps-metadata/` once archived). One more trap: if
   the probe's esbuild entry sits under a directory whose `node_modules` belongs to another checkout,
   esbuild bundles a second React and the component renders nothing. Import `react-dom` by absolute
   path from the lane (`evals/T3.2.4.eval.md` acceptance 5).

## Gate baselines section

Measured live at this file's own pickup commit (see footer). **`.ai/projects/artifacts/studio-ui-gate-baselines.md`
is the reference for the `lint:tokens` two-sided-ratchet *mechanism* — its own numeric tables for
`packages/ui` have already drifted twice since it was written on 2026-08-18: its biome file count
is now different below (see the table), and its ratchet total first regressed to a red count one
higher than its own committed baseline, then was fixed down to the total this table records
below. Re-measure, don't copy.** For the `lint:tokens` exit-code semantics themselves (0/1/2/3), `scripts/lint-tokens.mjs:1-29`'s
own header docstring is the **primary** source — more current and more authoritative than the
artifact, which is useful only for the historical "why a bare violation count is an unsafe gate"
framing (its TRAP 2 section).

| gate | command | result |
|---|---|---|
| token-lint ratchet | `node scripts/lint-tokens.mjs` | **59 against baseline 59, exit 0**, measured on `proj/26-10-28-00-updates-T0.1.1` @ `aa85bcb` (2026-10-29, `evals/T0.1.1.eval.r2.md` G7) and again on the merged `proj/26-10-28-00-updates` tip (2026-10-29, `logs/run.jsonl` seq 45). Prior: 59/59, exit 0, measured on `proj/26-10-27-00-updates-T1.1.3` @ `6b35dee` (2026-10-28, `evals/T1.1.3.eval.md` G5; its new 14px trigger inset is allow-commented). Prior: `lint:tokens — 59 violations in 18 files (baseline: 59)`, **exit 0**, measured on `proj/26-10-12-00-steps-metadata` @ `e6c7c17` (2026-10-13). Also 59/59, exit 0, at the fork point `main` @ `644be4a` (re-run 2026-10-13 in a scratch `git archive`). The project's new `.w6w-exprmodal-toggle-stack` literals are allow-commented, and its round-2 count-offset trap is fact 7. Prior: RED on `main` @ `b8e5d61` (2026-10-07) with `_expression-modal.scss` at 14 vs baseline 12. It was fixed on `main` before `644be4a`, not by this project. Prior: `59 violations in 18 files (baseline: 59)`, exit 0, on `main` @ `33d467a` (2026-10-04). `26-09-03-00-changes`'s T1.1.1 once regressed this with a hard-coded `6px` that neither its contract nor its eval ran this gate on, and its closeout caught it (`a0027cd`). **This gate is not covered by `tsc`/`biome`/`npm test`/`check:css` at all. Run it explicitly, and don't assume the other four imply it** |
| lint | `./node_modules/.bin/biome check .` | **293 files, exit 0**, measured on `proj/26-10-28-00-updates-T0.1.1` @ `aa85bcb` (2026-10-29, `evals/T0.1.1.eval.r2.md` "full `biome check .` 293 files rc0"). In the human's main checkout a foreign untracked WIP test (`src/__tests__/ParamsForm.multiselect-csv.test.ts`) adds one `noNonNullAssertion` error — not part of any branch; gate on "no NEW diagnostics" there. Prior: `Checked 256 files in 68ms. No fixes applied.` — 0 errors, measured on `proj/26-10-22-00-workflow-updates` @ `1804805` (2026-10-23). Prior: `Checked 210 files` (`f0cf816`, 2026-10-17). Prior: `Checked 205 files` — 0 errors, measured on `proj/26-10-13-00-review-followups-T1.1.3` @ `52545d8` (2026-10-13; 204→205 is `StepEditModal.rename.test.ts`). Prior: `Checked 204 files in 55ms. No fixes applied.` — 0 errors, measured on `proj/26-10-12-02-oauth-fix` @ `2cfe66a` (2026-10-13; 203→204 is that project's new `AppPicker.loader.test.ts`). Prior: `Checked 203 files in 53ms. No fixes applied.` — 0 errors, measured on `proj/26-10-12-00-steps-metadata` @ `e6c7c17` (2026-10-13; 198→203 is that project's 5 new test files). Prior: `Checked 198 files … Found 7 errors.`, measured on `main` @ `b8e5d61` (2026-10-07, `26-10-07-02-workflow-fan-out-and-merge` closeout). All 7 already present at `6df2823` (a separate WaitEditor commit landed just before: `organizeImports`/`format` in `StepBuilderModal.tsx`, `WorkflowFlowEditor.tsx`, `WaitEditor.tsx`, plus `noNonNullAssertion` in `WaitEditor.test.ts`); the fan-out project's own tip was clean. Prior: `Checked 180 files in 39ms. No fixes applied.` — 0 errors, measured on `main` @ `c5db9f0` (2026-10-04, `26-10-04-01-fixes` closeout). Prior: `Checked 172 files in 45ms.`, measured on `main` @ `33d467a` (2026-10-04). `161` → `172` (+11): `26-10-03-00-fixes` added the four `Execution*` components, their four stories, `execution-format.ts`, and `ExecutionHistory.test.ts`/`ExecutionList.test.ts`. Prior: `Checked 161 files in 38ms.`, measured on `proj/26-09-29-00-add-server-resources-view` @ `4fd65e4`. `152` → `161` (+9): that project's T1.2.1 added `ServerResources.tsx`, `server-resources-format.ts`, `server-resources.fixture.ts`, four `ServerResources*.stories.tsx` and two `__tests__` files. Prior: `Checked 152 files in 37ms. No fixes applied.` — 0 errors, measured on `26-09-23-01-ui-storybook-and-public-docs`'s T2.1.1 (unchanged by T2.1.1 itself: `biome.json`'s `files.include` is `src/**/*.ts(x)`, `vite.config.ts`, `.storybook/**/*.ts(x)` only — `scripts/` is never in scope, so the new `scripts/coverage-stories.mjs` adds 0). `122` → `152` (+30 new files) already happened before this task, at this project's own T1.1.1–T1.1.3: 28 new `*.stories.tsx` files (10 in T1.1.1, 11 in T1.1.2, 7 in T1.1.3) plus `.storybook/manager.ts` + `.storybook/fixtures.ts` (T1.1.3) — the only non-story files the include glob reaches. Prior: `Checked 122 files in 37ms. No fixes applied.` — 0 errors, measured on `26-09-19-01-python-runtime`'s closeout merge to `main`. `121` → `122` (+1 new file): T1.2.4 added `src/__tests__/ParamsForm.script-language.test.ts` (no new source file — `CodeEditor.tsx`, `ParamsForm.tsx` and `flow-types.ts` were extended in place: a `language` prop + JS/Python CodeMirror mode map on `CodeEditor`, the `effective()` sibling-value getter threaded into `ParamField`'s `code` branch, and a `language`-conditional default snippet). Prior: `Checked 121 files in 39ms. No fixes applied.` — 0 errors, measured on `26-09-16-01-workflow-execution-runner`'s closeout merge to `main`. `115` → `121` (+6 new files): T1.1.1 added `src/run-visuals.ts` + `src/__tests__/run-visuals.test.ts` + `src/__tests__/WorkflowFlowEditor.run-state-wiring.test.ts` (the run-status→visual pure module + its tests, plus AST-structural tests for `WorkflowFlowEditor.tsx` itself — no jsdom-mount precedent exists anywhere in this file for that component); T1.1.2 added `src/components/ExecutionLogPanel.tsx` + `src/components/StepStatusPill.tsx` + `src/components/__tests__/ExecutionLogPanel.test.ts` (both dispatched in parallel, disjoint footprints, confirmed zero file overlap by both evaluators). Prior: `Checked 115 files in 36ms. No fixes applied.` — 0 errors, measured on `26-09-15-00-updates`'s closeout merge to `main`. `111` → `115`: T2.1.1 added `src/app-pages.ts` + `src/__tests__/app-pages.test.ts` + `src/__tests__/AppPicker.paged.test.ts` + `src/__tests__/StepBuilderModal.ready-to-use.test.ts` (4 new files; `test/picker-paging/*` is outside biome's scanned scope here, same as `test/picker-layout/*` already was). Prior: `109` → `111`: T1.2.1 added `src/use-enter-submit.ts` + `src/__tests__/use-enter-submit.test.ts` (2 new files; `AddConnectionModal.tsx`/`AuthFieldsForm.tsx` were extended, not new). Prior: `107` → `109`: T1.1.1 added `YamlEditor.tsx` + `src/__tests__/YamlEditor.test.ts` (mirroring `JsonEditor.tsx`/`JsonEditor.copy.test.ts`, minus the lint/validity path — D-T0.0-4). Prior row: `105` → `106`: T1.1.1 (of `26-09-03-00-changes`, a different, same-named-item project) added `params-form-groups.test.ts`. `106` → `107`: T2.1.1 added `ActionTestForm.overrides.test.ts` |
| typecheck | `./node_modules/.bin/tsc -b --noEmit` | exit 0, no output — re-run on `e6c7c17` (2026-10-13) |
| unit suite | `NODE_OPTIONS=--experimental-strip-types pnpm test` (fact 3) | **1120 pass · 0 fail**, measured on the merged `proj/26-10-28-00-updates` in the harness workspace (2026-10-29, `logs/run.jsonl` seq 45; the T0.3.1 eval's narrower run read 1119 tests / 1118 pass / 1 skip). The human's main checkout reads **1124** — the extra 4 are the foreign untracked `ParamsForm.multiselect-csv.test.ts`, not on any branch. Prior: **1080 pass · 0 fail**, measured on `proj/26-10-27-00-updates-T1.1.3` @ `6b35dee` (2026-10-28, `evals/T1.1.3.eval.md` G6; peak RSS ~1.8 GB). Prior: **1074 / 0** at ui `main` @ `02a948f` (26-10-27-01 section below). Prior: **1043 tests · 1043 pass · 0 fail**, measured on `proj/26-10-24-02-agents-studio-foundations` @ `58bccaf` (2026-10-25, `ℹ tests 1043`, main's 26-10-24-02-updates merged in; excludes the 5 tests of the `.test.tsx` file in fact 3). Prior: 1008/1008 at `5f5f762` (that project's T5.1.1 eval). Prior: **957 tests · 957 pass · 0 fail**, measured on `proj/26-10-22-00-workflow-updates` @ `1804805` (2026-10-23, `ℹ tests 957`; +69 = `CanvasLayer`, `Markdown`, `canvas-utils`, `flow-nodes-compat`, `WorkflowFlowEditor.canvas` and extended `flow-utils`/`StepBuilderModal.commit` suites). Prior: **888 tests · 888 pass · 0 fail**, measured on `main` @ `f001214` (2026-10-17, `26-10-16-01-embed-composable-surfaces` closeout, fresh detached checkout; +B-1u/E-1u/D-12u lists, `assert-guard.test.ts`, pinned-pagination merge). Prior: **816 tests · 816 pass · 0 fail**, measured on `proj/26-10-16-00-pinned-pagination` @ `f0cf816` (2026-10-17; 802→816 is that project's T3.1.1 cases in the existing `createW6WApi`, `AppPicker.loader` and `AppPicker.paged` suites). Prior: **785 tests · 785 pass · 0 fail**, measured on ui `main` @ `a970b51` (26-10-13-02-fixes closeout, fresh detached checkout, 2026-10-13). Prior: 779 at `52545d8` (2026-10-13; +8 = new `StepEditModal.rename.test.ts`, extended `ParamsForm.json-binding`, `flow-utils`, `expression-dom`). Prior: **771 tests · 771 pass · 0 fail**, measured on `proj/26-10-12-02-oauth-fix` @ `2cfe66a` (2026-10-13; 757→771 is `AppPicker.loader.test.ts`, plus extended `AppPicker.paged` and `app-pages` suites, and whatever `main` added since). Prior: **757 tests · 757 pass · 0 fail**, measured on `proj/26-10-12-00-steps-metadata` @ `e6c7c17` (2026-10-13). 694→757 includes that project's 5 new files (`ParamsForm.json-binding`, `ExpressionEditorModal.meta`, `ExecutionLogPanel.meta`, `WorkflowFlowEditor.step-test-meta`, `CodeBlock.keys`) plus extended `step-preview-state`, `resolved-json` and `createW6WApi` suites, together with whatever landed on `main` between `b8e5d61` and the fork point `644be4a` (not attributed case by case). Prior: **694 tests · 694 pass · 0 fail**, measured on `main` @ `b8e5d61` (2026-10-07, `26-10-07-02-workflow-fan-out-and-merge` closeout: + `flow-fanout`, `flow-merge-node`, `flow-ports`, `flow-connect` cases, plus the WaitEditor commit). **Pass the flag via `NODE_OPTIONS`, never as a `node` argument** (fact 3: the CLI-flag form reports 1 false fail). Prior: **633 tests · 633 pass · 0 fail**, measured on `main` @ `f6fa937` (2026-10-05, `26-10-05-00-wrappers-tenant-embedding` closeout; +4 = the new `src/__tests__/createW6WApi.test.ts`). Prior: **629 tests · 629 pass · 0 fail**, measured on `main` @ `c5db9f0` (2026-10-04, `26-10-04-01-fixes` closeout; +45 across that project's ExecutionLogPanel run-error/E7/E8 cases, `WorkflowFlowEditor` `fitViewKey`, the new `RetryPolicyFields` tests, and the parallel `26-10-04-02-apps-provider` landing; the HistoryTimeline race below did not surface on this run — still gate on "no new failing test"). Prior: **584 tests · 583 pass · 1 fail**, measured on `main` @ `33d467a` (Node v22.16.0, 2026-10-04; re-run for this file). `547` → `584` (+37): `26-10-03-00-fixes`'s `ExecutionHistory.test.ts` and `ExecutionList.test.ts`. The lone failure is still `HistoryTimeline.test.ts`, and it fails the same way at `c8d19a7`, before that project's review round (its FOLLOWUPS F-5; it can also surface as the `getClientRects is not a function` signature). Prior: **547 tests · 546 pass · 1 fail**, measured on `proj/26-09-29-00-add-server-resources-view` @ `4fd65e4` (Node v22.16.0, 2026-09-29). The 1 fail is pre-existing and unrelated: `src/components/__tests__/HistoryTimeline.test.ts` removes its scratch `node_modules/.w6w-jsx-test-history/*.mjs` before async activity finishes, so the run reports an `ENOENT` uncaughtException after the test ends (a race; also red at `main` @ `c4b7e25` — 530 tests · 529 pass · 1 fail, that project's FOLLOWUPS F-3). `530` → `547` (+17): that project's T1.2.1 added `ServerResources.test.ts` and `server-resources-format.test.ts`. Prior: **537 pass, 0 fail** (`tests 537 · pass 537 · fail 0`), measured on `26-09-19-01-python-runtime`'s closeout merge to `main`. `530` → `537` (+7, one new file): T1.2.4's `ParamsForm.script-language.test.ts` — the `language` select drives `CodeEditor`'s mode, `effective()`-threading reaches `ParamField`'s `code` branch, and the language-conditional default snippet survives at the `values` level, not just the rendered doc (round 2 moved the swap mechanism there after round 1 found the naive render-level fix left the doc showing stale text for ~200ms while `values.code` was already correct — `@uiw/react-codemirror` suppresses the inbound value-prop overwrite briefly after a keystroke, so a test asserting only `view.state.doc.toString()` can pass on a mutant that clobbers `values.code` unconditionally; FOLLOWUPS.md F-9 in that project records the one remaining gap: case (c) still asserts the doc, not `values.current.code`, so that specific mutant is caught by the shipped code but not by this row's own gate). Prior: **530 pass, 0 fail** (`tests 530 · pass 530 · fail 0`), measured on `26-09-17-01-updates`'s closeout merge to `main`. `526` → `530` (+4, no new file): `WorkflowFlowEditor.tsx` gained a new `onTestRun?: () => void` prop (fired at test-start click, threaded through `performRunStep` and `StepEditModal`'s footer Test button — mirroring `StepTestRunProps`'s existing optional-callback idiom) and `ExecutionLogPanel` gained `onDismiss?: () => void`, rendered as a header row built on the existing `IconButton` primitive, present in BOTH its populated and `steps.length === 0` empty-state branches (the latter is the exact state the reported bug's screenshot showed). One new case added to the existing `src/__tests__/WorkflowFlowEditor.test-tab.test.ts` (`onTestRun` spy fires on the Test-button click); three new cases added to the existing `src/components/__tests__/ExecutionLogPanel.test.ts` (dismiss button present+wired in both branches when `onDismiss` is supplied, absent in both when it is not). **This row's own prior baseline was stale**: it read `521` (`26-09-16-01-workflow-execution-runner`'s own number) but this project's pickup measured `526` on a clean `main` — some project in between added 5 cases without correcting this table (not investigated further, same drift shape this file already flags elsewhere). Prior (as last correctly attributed): **521 pass, 0 fail** (`tests 521 · pass 521 · fail 0`), measured on `26-09-16-01-workflow-execution-runner`'s closeout merge to `main`. `489` → `521` (+32): T1.1.1 added 23 (19 pure-function cases in `run-visuals.test.ts` + 4 AST-structural cases in `WorkflowFlowEditor.run-state-wiring.test.ts`); T1.1.2 added 9 in `ExecutionLogPanel.test.ts`. Both independently re-verified by their own evaluators (re-derived mutants in scratch extractions, not the developers' self-reports). Prior: **489 pass, 0 fail** (TAP: `tests 489 · pass 489 · fail 0`), measured on `26-09-15-00-updates`'s closeout merge to `main`. `448` → `489` (+41): T2.1.1's `AppPicker.paged.test.ts`/`StepBuilderModal.ready-to-use.test.ts`/`app-pages.test.ts` (new files) plus extensions to the existing `StepBuilderModal.{connection-only,homepage-tabs,template-node}.test.ts` fixtures (D-17/D-17a's genuinely-absent-optional-method correction) — not independently re-attributed case-by-case; the aggregate delta is measured directly. Prior: `437` → `448`: T1.2.1 added 11 cases in the new `src/__tests__/use-enter-submit.test.ts` (bare-Enter fire, textarea/contenteditable/modifier-key exclusions, `enabled:false` off-switch, `preventDefault` ordering — the full M1–M6 mutation table). Prior: `431` → `437`: T1.1.1 added `src/__tests__/YamlEditor.test.ts` (6 cases covering the mutation table's M1–M5 rows plus 2 copy-button smoke tests), mirroring `JsonEditor.copy.test.ts`'s rig. This row's prior `410` was already stale before an earlier task touched anything — re-measured on `main` @ `752b31e` (that task's own fork point, clean tree) at **413**, not `410`: some project between `26-09-03-00-changes`'s ship and that one added 3 tests without correcting this table (not investigated further). That task's own T1.1.1 then added 13: 9 in the new `params-form-groups.test.ts` (`GroupField`/`RepeatField` rendering) and 4 new cases in the existing `StepBuilderModal.required-gate.test.ts` (`requiredParamsFilled`'s new `group` branch), landing at `413` → `426`. **T2.1.1 then added 5 more** in the new `ActionTestForm.overrides.test.ts` (the Overrides region's mutation battery), landing at `426` → `431` |
| `check:css` | `node scripts/build-css.mjs --check` | both `src/styles.css` and `src/code.css` up to date, exit 0 — re-measured on `e6c7c17` (2026-10-13) |
| story coverage | `node scripts/coverage-stories.mjs` | **58/58**, exit 0, measured on `aa85bcb` (2026-10-29, `evals/T0.1.1.eval.r2.md` G8; +`ResultViewer`, `HtmlPreview`). Prior: **56/56**, exit 0, measured on `6b35dee` (2026-10-28, `evals/T1.1.3.eval.md` G3). Prior: `coverage:stories — 43 exported components, 43 with stories, 0 missing`, exit 0, re-measured on `e6c7c17` (2026-10-13; unmoved — `26-10-12-00-steps-metadata` exported no new component). Prior: 43/43 on `main` @ `b8e5d61` (2026-10-07). Prior: `42/42`, measured on `main` @ `c5db9f0` (2026-10-04, `26-10-04-01-fixes` closeout; includes the new `RetryPolicyFields`). Prior: `40/40` on `main` @ `33d467a` (2026-10-04; `36` → `40`: `26-10-03-00-fixes`'s `ExecutionStats`, `ExecutionFilters`, `ExecutionList`, `ExecutionDetail`). Earlier, `proj/26-09-29-00-add-server-resources-view` @ `4fd65e4` (`32` → `36`: `ServerResourcesCard`, `ServerResourcesCardSmall`, `ServerResourcesRail`, `ServerResourcesBadge`, each with its own `*.stories.tsx`). Added by `26-09-23-01-ui-storybook-and-public-docs`'s T2.1.1 (zero-tolerance gate, no baseline file: enumerates every component `package.json`'s `exports` map reaches and fails if any has no co-located `*.stories.tsx` declaring `component: <Name>`) |
| `build-storybook` | `pnpm build-storybook` | `Storybook build completed successfully` (Vite build, `storybook-static/`, gitignored), exit 0 — built green by `26-10-03-00-fixes`'s T3.1.1 evaluator (`evals/T3.1.1.eval.md` G1, browser-measured `ExecutionFilters`' `OneRow` story at 500/900/1280px); before that, re-run green on `proj/26-09-29-00-add-server-resources-view` @ `4fd65e4`; first measured at `26-09-23-01-ui-storybook-and-public-docs`'s T2.1.1 pickup: `32/32` story files indexed (`storybook-static/index.json`), `117` named stories, `0` misses (`.ai/projects/artifacts/story-index-check.mjs`) |
| picker-layout (Docker/Chromium) | `bash test/picker-layout/run.sh` | **GREEN 22/22** (matching `EXPECTED_TESTS` in fact 4 above), confirmed by `26-08-26-01-studio-fixes`'s T1.1.3 gates — not re-run at `26-08-31-00-issues`'s closeout since none of its three nodes touched picker-layout-adjacent code |
| picker-paging (Docker/Chromium) | `bash test/picker-paging/run.sh` | **GREEN 11/11**, new in `26-09-15-00-updates` (T2.1.1: I-2 bounded/paged app selector for 500-2000 apps). Mounts the real `AppPicker`/`StepBuilderModal` against a 2,000-entry catalog fixture — bounded initial response, explicit server search/filter request, next-cursor pagination, query-change reset. Mirrors `picker-layout`'s own scratch-copy/esbuild/Playwright mechanics. |
| copyable (Docker/Chromium) | `bash test/copyable/run.sh` | **GREEN 9/9**, confirmed by `26-08-26-01-studio-fixes`'s T1.1.3 gates (`.ai/projects/.work/26-08-26-01-studio-fixes/results/T1.1.3.result.md`) — **not re-run at `26-08-31-00-issues`'s closeout**: that project's own T1.1.3 (`copyable` prop on `JsonEditor`) could not run it either, for the same reason recorded in `FOLLOWUPS.md` — it hard-requires a sibling `packages/studio` checkout the harness workspace does not symlink in. `Copyable.tsx` itself is provably unchanged (byte-identical `Copyable.test.ts`/`CopyableText.test.ts`, verified by both T1.1.2 and T1.1.3's evaluators), so this row is stale on file identity, not on behavior — re-run from a full checkout if that changes |
| expr-template (Docker/Chromium) | `bash test/expr-template/run.sh` | **GREEN 18/18**, re-run at `26-08-31-00-issues`'s closeout on the merged integration tip (`proj/26-08-31-00-issues` — T1.1.2 touched the Result pane's height/flex and the rail this suite's T-height/G-sigil/R4 cover). This gate was missing from this table entirely before this project (see `FOLLOWUPS.md` F-N4) despite fact 5's own text already naming it a real-Chromium suite alongside picker-layout |
| html-preview XSS (host Chromium) | `NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test test/html-preview/html-preview-xss.test.ts` | **2/2**, measured on the merged `proj/26-10-28-00-updates` (2026-10-29, `logs/run.jsonl` seq 45; also `evals/T0.1.1.eval.r2.md` G2). Renders the real `HtmlPreview` via `react-dom/server` into host `playwright-core` Chromium with a local server counting beacon hits. **In no `package.json` script and not in the `pnpm test` glob** (`FOLLOWUPS.md` F6) — run it by hand whenever `HtmlPreview.tsx`/`result-format.ts`/`ResultViewer.tsx` change |
| combo-layout (host Chromium) | `NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test test/combo-layout/combo-layout.test.ts` | **3/3** on the merged tip (2026-10-29, `logs/run.jsonl` seq 45); fails 3/3 on the pre-fix base (`evals/T0.2.1.eval.md`). Same wiring caveat: no `package.json` script |

The `lint:tokens` line above is **pinned** by this project's own T1.1.1: it dropped
`_step-builder.scss`'s violations from a red 4-vs-baseline-3 regression back to a clean, matching
baseline, which is what carries the whole-package total from the artifact's stale 62 down to 59. If
`node scripts/lint-tokens.mjs` prints anything else in your checkout, the ratchet has moved since
this file was last verified — re-measure and update this table rather than trust it.

## Maintenance — why this file has a shelf life

A standing doc nobody updates is worse than no doc: it is confidently wrong and it gets believed.
This project's own gap-analysis found exactly that had already started here — this file's own fact
1 (the shared-class trap's old assertion-site count) and fact 3 (the `pnpm test` glob shape) both
carried claims from an earlier intake that no longer reproduced, and
`studio-ui-gate-baselines.md`'s numeric tables had already drifted (see *Gate baselines* above) —
before this file even existed.

So:

- **Cite every claim** — a `file:line`, a command, or a measurement. This project's own contract
  fixed `file:line` as the citation form for `packages/ui` (a smaller, slower-moving package than
  `w6w-frontend`, where `frontend/.ai/PLANNER.md`'s own Maintenance section instead prefers text
  anchors because lines there rot fast). Whichever form you use, **re-verify at your own pickup
  commit** rather than trust a number carried forward — every citation in this file was re-run
  against its own pickup commit rather than copied from an earlier project's notes, which is exactly
  what caught fact 1 and fact 3's drift.
- **Delete a wrong claim, do not annotate it.** "This may be out of date" teaches nobody anything.
- **Updating this doc is part of project closeout, not optional** — a project that touches
  `packages/ui`'s shared classes, its test globs, its gate baselines, or its build/lint scripts
  should fold the correction in as part of its own work, not leave it for the next reader to
  rediscover.
- **This file describes the commit in its `verified:` line below — the tip at authoring time, not
  necessarily your branch point.** If your project branches from an older base, diff before you cite:
  `git diff <base>..<verified-sha> --stat` over `packages/ui` is one command and tells you exactly
  which of the facts above are ahead of you.

verified: 2026-10-29 · against `proj/26-10-28-00-updates` @ `65e8558` (closeout: *Gate baselines* unit/lint/stories/tokens rows re-measured, html-preview + combo-layout rows added; *Where work happens* `test/` census corrected; *npm packaging* expr range and the `Combobox` color-scheme bullet corrected; new section *26-10-28-00-updates* at the bottom). Prior: 2026-10-28 · against `proj/26-10-27-00-updates` @ `2e1575e` (closeout: *Gate baselines* unit/stories/tokens rows re-measured by T1.1.3's eval; new section *26-10-27-00-updates* at the bottom). Prior: 2026-10-25 · against `proj/26-10-24-02-agents-studio-foundations` @ `58bccaf` (closeout: new section *Model-provider badge + filter in `AppPicker`* at the bottom; fact 3 test-file counts and the `.test.tsx` recurrence updated; unit suite 1043/1043 re-run for this file). Prior: 2026-10-23 · against `proj/26-10-22-00-workflow-updates` @ `1804805` (closeout: workflow model is `nodes`, new section *Workflow nodes + canvas* at the bottom; unit suite 957/957 and biome 256 files re-run for this file). Prior: 2026-10-17 · against `proj/26-10-16-00-pinned-pagination` @ `f0cf816` (project 26-10-16-00-pinned-pagination closeout: unit suite 816/816 via `NODE_OPTIONS`, biome 210 files with 0 errors, re-run for this file; new section *Pinned pagination* at the bottom). Prior verification 2026-10-13 · against `proj/26-10-13-00-review-followups-T1.1.3` @ `52545d8` (project 26-10-13-00-review-followups: unit suite 779/779 via `NODE_OPTIONS` and biome 205 files with 0 errors, measured by that node's evaluator; +1 file = `src/__tests__/StepEditModal.rename.test.ts`. New rule: a step id may not contain `.` — `stepIdError` in `src/flow-utils.ts` (rename refuses inline with `A step id can't contain a dot (.).`), and `src/components/expression-dom.ts` no longer parses a dotted id). Prior verification 2026-10-13 · against `proj/26-10-12-02-oauth-fix` @ `2cfe66a` (project 26-10-12-02-oauth-fix closeout: unit suite 771/771 via `NODE_OPTIONS`, biome 204 files with 0 errors, fact 1's `AppPicker.tsx` line numbers and fact 3's file counts re-measured; new section *AppPicker `loadPage`* at the bottom). Prior verification 2026-10-13 · against `proj/26-10-12-00-steps-metadata` @ `e6c7c17` (project 26-10-12-00-steps-metadata closeout, before its merge to `main`. Re-run for this file: unit suite 757/757 via `NODE_OPTIONS` (the CLI-flag form gives 756/1, fact 3); biome 203 files with 0 errors; `tsc` exit 0; `check:css` up to date; story coverage 43/43; `lint:tokens` 59/18 exit 0. Facts 3, 7 and 8 are new or corrected; *Where work happens* counts corrected; see that project's entry at the bottom). Prior verification 2026-10-07 · against `main` @ `b8e5d61` (project 26-10-07-02-workflow-fan-out-and-merge closeout: unit suite 694/694, biome 198 files with 7 pre-existing errors, story coverage 43/43, `lint:tokens` RED on a pre-existing `_expression-modal.scss` regression — all re-run for this file; see that project's entry at the bottom). Prior verification 2026-10-05 · against `main` @ `f6fa937` (project 26-10-05-00-wrappers-tenant-embedding closeout: unit suite 629→633 with 0 fail, biome 181 files clean, story coverage 42/42, `lint:tokens` unmoved at 59/18 — all re-run for this file; see that project's entry at the bottom). Prior verification 2026-10-04 · against `main` @ `c5db9f0` (project 26-10-04-01-fixes closeout: unit suite 584→629 with 0 fail, biome 172→180, story coverage 40→42, `lint:tokens` unmoved at 59/18 — all re-run for this file; new fact: the step retry block is the exported `RetryPolicyFields` — see the 26-10-04-01-fixes entry at the bottom). Prior verification 2026-10-04 · against `main` @ `33d467a` (project 26-10-03-00-fixes closeout: the
execution-history family, see the entry at the bottom; components 23→27, partials 31→32,
`components/__tests__` 14→16, new fact 6, unit suite 547→584 with 1 pre-existing fail, biome
161→172, story coverage 36→40, `lint:tokens` and `check:css` unmoved, all re-run for this file);
prior verification 2026-09-29 · against `proj/26-09-29-00-add-server-resources-view` @ `4fd65e4` (project
26-09-29-00-add-server-resources-view closeout, before its merge to `main` — the server-resources
display family, see the entry at the bottom; unit suite 537→547 with 1 pre-existing fail, biome
152→161, story coverage 32→36, components 22→23, partials 30→31, `lint:tokens` and `check:css`
unmoved); prior verification 2026-09-23 · against `proj/26-09-23-01-ui-storybook-and-public-docs-T2.1.1` (project
26-09-23-01-ui-storybook-and-public-docs, T2.1.1 — measured on its own task branch, forked from the
project's integration workspace after T1.1.1–T1.1.3 + T1.2.1 merged; not yet merged to `main`, so no
post-merge sha to cite here. *Where work happens* corrected to three `scripts/` tools
(`scripts/coverage-stories.mjs` added); gate table gained `story coverage` and `build-storybook` rows
(both new in this project); `lint` row's `122` → `152` (+30: the story sweep, T1.1.1–T1.1.3 — 28
`*.stories.tsx` files + `.storybook/manager.ts` + `.storybook/fixtures.ts`) had already happened
before T2.1.1 touched anything — `scripts/` sits outside `biome.json`'s `files.include`, so
`coverage-stories.mjs` itself adds 0; unit suite (`537`), `lint:tokens` (`59/18`) and `check:css` are
all unmoved by this task, re-measured directly rather than assumed; prior verification 2026-09-19 ·
`c308bd3`, 26-09-19-01-python-runtime closeout — gate table updated: unit suite 530→537 (+7, one new
file, `ParamsForm.script-language.test.ts`), biome 121→122 (+1, same file — no other new file;
`CodeEditor.tsx`/`ParamsForm.tsx`/`flow-types.ts` extended in place), lint:tokens/check:css untouched
by that diff; prior verification 2026-09-17 · `1a8a9be`, 26-09-17-01-updates closeout; before that
`4f285a0`, 26-09-16-01-workflow-execution-runner closeout; before that `2d4f404`, 26-09-11-00-fixes
closeout)

**What this project changed here, at a glance** — this file did not exist before
`26-08-22-02-ui-planner-and-token-debt`; `packages/ui/.ai/` had zero prior art, and this task
(T1.1.2) is what created it, mirroring `packages/frontend/.ai/PLANNER.md`'s shape but inline (no
`context/` split — `packages/ui` is not big enough to warrant one). Its sibling task, T1.1.1,
dropped `_step-builder.scss`'s `lint:tokens` entry from a red 4-vs-baseline-3 regression to a clean
match, which is what the *Gate baselines* table above records as the whole-package `59 violations in
18 files (baseline: 59)` total — replacing the older, now twice-stale `62/19` figure that
`studio-ui-gate-baselines.md` still carries. `26-08-26-01-studio-fixes`'s T1.1.3 corrected fact 4
(the `test/picker-layout` `EXPECTED_TESTS` default and matching `test(` count, both `21`→`22`) and
re-verified — not changed — the unit-suite baseline as measured at its own pickup commit (`313`, not
the `316` an earlier pass through this file had assumed without re-measuring against the pickup
commit it named). **At `26-08-26-01-studio-fixes`'s own closeout** (merge to `main` @ `895e25d`), the unit suite,
biome file count, and both test-root file counts in fact 3 were re-measured again and bumped to their
current post-merge values (`335` pass, `92` biome files, `23`/`9` test files) — the `313`/`88`/`21`/`8`
figures above are history, kept only where a sentence explicitly compares against them.

**At `26-08-07-01-ui-dblclick-test-receiver-pin`'s closeout** (merge to `main` @ `f846edc`): this
project pinned the receiver in `WorkflowFlowEditor.dblclick-wiring.test.ts`'s add/remove-pair
assertion (a real listener-leak mutant — registering on `document`, cleaning up on `div` — used to
pass the suite undetected) and fixed two stale comments; it added 0 new tests and 0 new files. The
unit suite, biome file count and fact 3's `src/__tests__` count were re-measured and bumped again to
their current post-merge values (`340` pass, `93` biome files, `24`/`9` test files) — but that delta
is **not** this project's own: it is entirely `StepBuilderModal.autoconnect.test.ts`, added by a
different, unrelated project (`feat(stepbuilder): third connection state`) that merged to `main`
between this file's two verifications. `335`/`92`/`23` are now history.

**T1.1.1 of `26-08-29-02-workflow-issues`** (measured on its own task branch,
`proj/26-08-29-02-workflow-issues-T1.1.1`, forked from `main` @ `6a145c3` — not yet merged, so no
post-merge sha to cite here) widened `ExpressionOptions.documents` from `string[]` to
`ExpressionDocumentSource[]` (a document's top-level JSON fields, gated on `doc.format === "json"`
and a successful plain-object parse, mirroring `run-seed.ts`'s `documentsSeed`), added the matching
nested `w6w-exprmodal-subsources` rendering plus a second, visible "insert as render" action on each
field row (`data-testid="expr-insert-render"`), and extended `renderResult`/`usedRefs` to treat a
`render` part's ref the same way a `var` part's is treated for the design-time preview. It added one
new file (`ExpressionEditorModal.documents.test.ts`, 6 tests) and 2 new `renderResult` cases in the
existing `expression-template.test.ts`, bumping the unit suite from this branch's fork-point baseline
of `348` to `356` and the biome file count from `94` to `95` (fact 3's `src/__tests__` count moves
from `25` to `26` accordingly). `_expression-modal.scss` gained the new render-button styling entirely
in `--w6w-*` tokens (font-size, gap) plus box-geometry properties the ratchet does not scan
(width/height/border/border-radius, per this file's own *Gate baselines* note above) — the
`lint:tokens` whole-package total stays unchanged at `59 violations in 18 files (baseline: 59)`.

**T1.1.1 round 2** (same branch, same fork point) corrected a pre-existing drift the round-1 pass
didn't touch: *Where work happens* read `21` smaller components under `src/components/`, already
wrong at this file's own `verified:` commit (`f846edc`) — `22` there and `22` at this branch's own
HEAD (`find src/components -maxdepth 1 -type f ! -name '*.stories.tsx' | wc -l`, excluding the
`__tests__` subdirectory `git ls-tree` also lists). Corrected to `22`. It also rewrote the stale
`ExpressionEditorModal.tsx:106-107` comment claiming a render part can only ever be authored by
toggling an existing `var` chip — round 1's own D-P1 feature (the insert-as-render action) inserts
one directly, so the comment now describes both authoring paths. No behavior change; no gate figure
moved.

**`26-08-30-00-fixes`'s T1.1.1 and T1.1.2** (measured on `proj/26-08-30-00-fixes-T1.1.2`, forked
from `proj/26-08-30-00-fixes` at the merged T1.1.1 tip — not yet merged to `main`, so no post-merge
sha to cite here) found this doc's *Gate baselines* table and fact 3 had already drifted **before**
either task started: this project's own base, `f76edc7`, independently re-measured (`git archive
f76edc7` into a scratch checkout, both gates re-run there) rather than trusted from the contract,
was already `359` pass / `96` biome files / `27` `src/__tests__` files — not the `356`/`95`/`26`
this doc had recorded. T1.1.1 (the error-port edge lane derivation + `LANE_HINT` rewording) added
one new file, `WorkflowFlowEditor.error-port-wiring.test.ts`, plus cases in the existing
`flow-connect.test.ts`/`flow-utils.test.ts`, landing at `370` pass / `97` biome files / `28`
`src/__tests__` files. T1.1.2 (the step edit modal: one combined App+Connection field, the ports
checkbox hidden behind `SHOW_STEP_PORTS`, and on-error copy reworded to state retry-first/
continue-proceeds/error-edge-overrides per `rfcs/workflow.md`'s Amendment) added one new file,
`StepEditModal.setup-and-configure.test.ts` (10 tests), landing at the **`380`/`98`/`29`** this
doc's *Gate baselines* table and fact 3 now record. It also deleted this doc's stale claim that
`workspace-up.sh` misses `pnpm-workspace.yaml` in its sibling-closure `find` — re-checked directly
against `.orchestration/projects/_templates/tools/workspace-up.sh:70`, which already lists
`pnpm-workspace.yaml` alongside `deno.json`/`package.json`; this lane's own `core` sibling symlink
resolved correctly (`readlink -f node_modules/@w6w/expr` → a real path), so the claim no longer
reproduced and was removed rather than annotated, per this file's own Maintenance rule.

**`26-08-31-00-issues`'s three nodes** (measured on `proj/26-08-31-00-issues` post-merge, forked
from `main` @ `2486441` — not yet merged to `main`, so no post-merge sha to cite here) found this
doc's *Gate baselines* table had already drifted **before any task started**: `main` @ `2486441`
measured `383` pass / `98` biome files (this doc's stale `380`/`98` — the biome count was already
correct, only the unit-suite count had drifted), and the table had no `expr-template` row at all
despite fact 5 already naming it a real-Chromium suite alongside `picker-layout`. T1.1.1
(`InternalNodeDef.output` for `@w6w/template · render` and `@w6w/http · request`, projected by
`projectStepSources`) extended the existing `step-preview-state.test.ts` — no new file, no biome
count change. T1.1.2 (expr-editor rail reorder, `Inputs` gate, collapse-by-default, Result-pane
copy control) added `ExpressionEditorModal.rail.test.ts`. T1.1.3 (`copyable` prop on `JsonEditor`,
wired to the six step-JSON panes) added `components/use-copy.ts` and `JsonEditor.copy.test.ts`,
landing at the **`398`/`101`/`31` (`src/__tests__`)** this doc's table and fact 3 now record. The
`expr-template` suite was re-run at closeout (T1.1.2 touched the Result pane's height/flex the
suite's `T-height` gates) and added to the table as **GREEN 18/18**. `test/copyable/run.sh` stayed
un-re-run — it hard-requires a sibling `packages/studio` checkout the harness workspace does not
symlink in, the same gap T1.1.3's own contract hit and recorded in
`.ai/projects/.work/26-08-31-00-issues/FOLLOWUPS.md`; `Copyable.tsx` itself is proven byte-identical
by both T1.1.2 and T1.1.3's evaluators, so the row is stale on provenance only, not on behavior.

**`26-08-31-00-issues`'s ship step** (merged to `main`, this repo's own commit `1a2d056`) found the
human's `packages/ui` checkout carrying uncommitted WIP overlapping 3 of the project's own touched
files, blocking the merge outright. Inspected and committed ahead of the merge (`a10cfe8`, not
authored by this project): a `failureHandling` prop on `NodeConfigForm` (gates retry/on-error
controls off for trigger nodes) and `resolved-clip.ts` (clips long resolved values in
`ResolvedParams`' Test-tab rows behind a toggle) — the latter added
`components/__tests__/resolved-clip.test.ts` (5 tests, 1 new file) and one new case in the existing
`WorkflowFlowEditor.error-port-wiring.test.ts`, bumping this doc's table and fact 3 to
**`404`/`103`/`31`**. Three more direct, human-reported UI fixes landed on `main` immediately after
(`196bef8`, `8e2ef0b`, `14fc103`): `ResolvedParams`' rows moved from a stacked `.w6w-field` layout to
a dedicated `.w6w-resolved-table`/`.w6w-resolved-row` two-column grid (key left, value right, one
shared grid via `display: contents` rows rather than one grid per row), with the value in full text
color instead of muted so it reads distinctly from its label, row text 10% smaller
(`calc(var(--w6w-fs-sm) * 0.9)`), and no `column-gap` (a gap left a hole no cell's border crossed,
breaking the row divider — replaced with `padding-right` on the label instead, which stays inside
each cell's own box). None of the three added or removed a file, so the gate-baseline counts above
are unmoved by them.

**`26-09-03-00-changes`'s T1.1.1** (merged to `main` at `b2c3e27`, hardened to `a0027cd`) added
`RepoSyncIndicator` — a header status control (icon + branch + short sha, an inline flyout with a
"Sync now" slot) built with no shared `Menu`/`Popover` primitive in this package (a deliberate
choice, see that project's D-3) — one new component file, one new test file
(`components/__tests__/RepoSyncIndicator.test.ts`), and one new SCSS partial
(`_repo-sync-indicator.scss`, the 29th, appended to `styles.scss`'s `@use` list). Landed the gate
baselines at **`410`/`105`/`29` partials / `11` `components/__tests__` files**. It also corrected
this doc's stale `22`-components figure (already wrong before this project touched anything — see
*Where work happens* above) and — the one thing worth a future contract-writer's attention — its
own contract's test plan ran `tsc`/`biome`/the unit suite/`check:css` but not `lint:tokens`, so a
hard-coded `6px` literal in the new partial shipped past both the developer and evaluator
undetected; the closeout Phase-3 gate sweep caught it (a real, currently-green, separately-gated
ratchet this table has documented all along), fixed it (`var(--w6w-sp-1-5)`, exactly `6px`), and
restored the ratchet to its unchanged baseline. **Gate baselines table above already reflects the
fixed state** — the regression never reached a merged `main` commit uncorrected.

**`26-08-20-01-param-groups-and-extra-fields`'s T1.1.1** (measured on its own task branch, forked
from `main` @ `752b31e` — not yet merged, so no post-merge sha to cite here) found this doc's
*Gate baselines* table already stale before it touched anything: `main` @ `752b31e` measured **413**
pass, not the `410` this table recorded (the biome/partial/component-test-file counts were still
correct). This task added `ParamsForm.tsx`'s `GroupField` (a `type: "group"` param with non-empty
`children` renders as a nested form, writing a `Record` nested under the group's own key) and
`RepeatField` (a `repeat: true` param — scalar or `group` — routes to the existing `ArrayField` with
a synthesized `item`, never a second list component), extended `requiredParamsFilled`
(`StepBuilderModal.tsx`) with a matching `group` branch, and declared `repeat?: boolean` on
`types.ts`'s `ActionParam`. It added one new file, `params-form-groups.test.ts` (9 tests), plus 4 new
cases in the existing `StepBuilderModal.required-gate.test.ts`, landing the gate baselines at
**`426`/`106`/`29` partials / `32`/`11` `__tests__` files** (fact 3's file counts above bumped
accordingly). `lint:tokens` is unmoved (`59 violations in 18 files`, baseline `59`) — no CSS
touched.

**`26-09-11-00-fixes`'s T1.1.1** added `YamlEditor.tsx` (`src/`), a CodeMirror 6 YAML editor
mirroring `JsonEditor.tsx`'s exact structure — theme block, `basicSetup`, the `readOnly`/`editable`
a11y split, the `copyable` button reusing `Copyable.tsx`/`use-copy.ts` — minus the lint/validity path
(`onValidChange`/`onValidityChange`/`lintGutter`/`jsonParseLinter`, deliberately: D-T0.0-4). This is
the first CodeMirror-6 editor added to this package since `JsonEditor.tsx`/`CodeEditor.tsx`
themselves; there is no third one and no precedent anywhere else in the workspace (grepped both
`packages/ui/src` and `packages/studio/src` for `codemirror`/`lang-yaml` before building — zero
hits). New dependency: `@codemirror/lang-yaml@^6.1.2` (resolved `6.1.3`), verified compatible with
the `@codemirror/*` versions already pinned here. Barrel-exported from `src/index.ts` (never the
`/code` subpath — that exists specifically so read-only consumers avoid the CodeMirror dependency
graph, and both existing editors are already index-barrel-only). Fact 1's top-level `.tsx` count
moved `14` → `15`; the *Gate baselines* table above reflects the new `109`/`437` totals. `lint:tokens`
is unmoved (`59 violations in 18 files`, baseline `59`) — no CSS touched.

**`26-09-27-00-studio-fixes`'s T1.1.1** fixed every `@w6w/ui` dialog whose footer scrolled out of view
under tall content (`Modal`'s `dialog.w6w-modal` is unconditionally `overflow:auto` with no dedicated
body-scroll region). New CSS in `src/styles/_modal.scss`: `.w6w-modal-body { display:flex;
flex-direction:column; gap:var(--w6w-sp-3); flex:1; min-height:0; overflow-y:auto }`, and
`.w6w-modal-actions` swapped `margin-top:auto` for `flex-shrink:0`. Wrap-and-restructure only, no
`Modal.tsx` prop/API change — 5 components touched (`ConfirmModal.tsx`,
`ExpressionEditorModal.tsx`, `WorkflowFlowEditor.tsx`'s run/test modal + its `StepRunCollect` form,
`AddConnectionModal.tsx`'s `ConnectionConfig`). `StepBuilderModal.tsx`'s 4 sites and
`WorkflowFlowEditor.tsx`'s step-editor site were **already** in this shape (via the older,
independent `.w6w-stepconfig-body/-footer` idiom in `_step-config.scss`/`_step-builder.scss`) and
were left untouched — see fact-worthy callout: **this repo now has three still-un-consolidated
copies of the same pinned-footer idea** (`.w6w-modal-body`/`.w6w-modal-actions` here,
`.w6w-stepconfig-body/-footer`, and `_tester.scss`'s `.w6w-tester-*-scroll`/`-actions-footer`) — a
future cleanup should fold all three onto the new generic pair rather than adding a fourth.
`AddConnectionModal.tsx`'s `selectedApp` branch also lost its `.w6w-stepbuilder-content` wrapper
(deliberately — its fixed `height:100%` left the frame's percentage height unresolved, pushing the
footer off-screen at y≈2786 in an 800px viewport; the picker/loading branches keep it, unchanged).
Gates: `./node_modules/.bin/tsc -b --noEmit` exit 0, biome **152 files, 0 errors — unmoved** (no new
files, existing components only), unit **537/537 — unmoved**, `node scripts/build-css.mjs --check`
up to date (the CSS lives in `_modal.scss`; `src/styles.css` is committed, regenerated build output —
never hand-edit it), `lint:tokens` unmoved (`59/59`), `coverage:stories`/`build-storybook` clean. A
real-Chromium layout probe (default/wide/xl sizes, the `.w6w-stepconfig` frame nested inside, a short
`wide` dialog) and a built-Storybook render both confirmed the footer stays pinned and the body
scrolls. `HITL-1` (whether this `ui`-side fix belonged in that project's scope at all, vs. staying
`packages/studio`-only) was open at merge time, pinned-default-widen, independently verified correct
by that project's evaluator, and confirmed by the human at closeout.

**`26-09-29-00-add-server-resources-view`'s T1.2.1** (on `proj/26-09-29-00-add-server-resources-view`
@ `4fd65e4`, not yet merged to `main`) added the server-resources display family in one module,
`src/components/ServerResources.tsx`: `ServerResourcesCard`, `ServerResourcesCardSmall`,
`ServerResourcesRail` and `ServerResourcesBadge`, plus the `ServerResourceSample` type from
`src/components/server-resources-format.ts` — all barrel-exported from `src/index.ts` (grep
`ServerResource`). They are pure presentational: each takes `samples` and renders the last one plus a
sparkline over the whole array, with no network, context or host-API read (the module's own header
docstring). The sparkline is hand-rolled inline SVG (`<polyline>`, `sparklinePoints`) — no chart
dependency (`grep -c 'chart' package.json` → 0). An unknown value renders as an em dash, never `0`.
Styles live in `src/styles/_server-resources.scss` (`@use "styles/server-resources"` in
`src/styles.scss`). The data layer — the SSE stream and the operator/visibility gate — is studio's
(see `packages/studio/.ai/PLANNER.md`). Gate figures are in the *Gate baselines* table above.

**`26-10-03-00-fixes`** (merged to `main` @ `c8d19a7`, v0.0.7; review round @ `33d467a`, v0.0.8;
diff `d4ad6e7..33d467a`) added the execution-history family that studio's History page and modal
render (`packages/studio/.ai/PLANNER.md` fact 11f). There are four components, each barrel-exported
from `src/index.ts` with its own `*.stories.tsx`:
- `ExecutionStats` (`src/components/ExecutionStats.tsx`) is the aggregate strip.
- `ExecutionFilters` is fully controlled. The host owns `ExecutionFilterValue`, and the component
  holds no state. Since the review round it lays out on one row at desktop widths. The rule is
  width-driven, `flex: 1 1 160px`, because a container query cannot see its own `flex-wrap` and
  there is no wrapper element (that project's RETRO O-2).
- `ExecutionList` is the paged rows, built on `ListItem` and `StepStatusPill`.
- `ExecutionDetail` is one execution in full, reusing `ExecutionLogPanel` for workflow steps.

All four are presentational: the host maps its own records in, and nothing fetches. Two support
changes came with them. `src/components/execution-format.ts` holds the shared formatters
(`formatDurationMs`, `formatExecutionTime`), which render an unknown duration as an em dash, never
`0`. `StepStatusPill` now also accepts the run-level `ExecutionStatus` union (`queued`, `running`,
`succeeded`, `failed`, `canceled`), and its new `-queued`/`-canceled` pills use existing muted
tokens (F-7). Styles live in `src/styles/_execution-history.scss`, plus a small addition to
`_execution-log.scss`. Gate figures are in the *Gate baselines* table above.

**26-10-04-01-fixes (2026-10-04, `main` @ `c5db9f0`).** The step editor's retry block ("Retry on
failure" checkbox + Attempts / Delay (ms) / Backoff, defaults 3 / 1000 / Fixed) is now the exported
`RetryPolicyFields` (`src/RetryPolicyFields.tsx`, re-exported from `src/index.ts` with
`RetryPolicyValue`/`RetryTarget`); `NodeConfigForm` renders it and studio's Error handling rail reuses
it for Function / Endpoint / whole-Workflow retry, so **every retry editor must go through this
component** (human ruling HITL-1: every retry config carries attempts, delay and backoff, like the
step's). The step editor's markup was pinned byte-identical across the extraction by a hash probe
(`.ai/projects/done/26-10-04-01-fixes/artifacts/T4.4.1-markup-probe.mjs`). The block is hidden on
`@w6w/call` and `@w6w/control` steps (the engine ignores `Step.retry` there). `ExecutionLogPanel` also
gained `error` per step plus `runError`/`stepErrors` props, and `WorkflowFlowEditor` a `fitViewKey`
prop (re-fit once when it changes after mount). Known gap: the Attempts/Delay clamps aren't pinned by
a negative-input test (that project's FOLLOWUPS T4.4.1-N1).

**26-10-05-00-wrappers-tenant-embedding (2026-10-05, `main` @ `f6fa937`).** `createW6WApi`'s `token`
option now takes a string or a sync-or-async supplier `(ctx?: { forceRefresh?: boolean }) => string |
null | undefined | Promise<…>`, awaited once per request inside `rawReq` (`src/createW6WApi.ts`) — the
same shape as `@w6w/sdk`'s `TokenProvider`. `ApiError` there no longer uses a TypeScript
parameter-property constructor: Node's `--experimental-strip-types` cannot import a module that uses
one, and `createW6WApi.test.ts` imports this module directly, so **keep new classes in modules a
unit test imports free of parameter properties, enums and namespaces** (strip-types rejects all three).
The `@w6w/react` adapter now type-checks against `src/provider.tsx`'s real `W6WApi` from the wrappers
repo (`react/src/__tests__/ui-conformance.test.ts`, pinned to a `github:w6w-io/w6w-ui#<sha>`
devDependency, by relative path to `provider.tsx`, not the barrel) — a breaking change to `W6WApi`
now fails that test when the pin moves, so treat `W6WApi` as a published contract.

**26-10-07-02-workflow-fan-out-and-merge (2026-10-07, `main` @ `b8e5d61`).** A node may now have
several success edges: `flow-connect.ts`'s connect is additive and refuses only past the source's
`ports.out` cap; ports resolve field-wise (action over app, `"many"` = `Infinity`) via
`resolvePorts`/`nodePortsForStep` (`src/flow-types.ts`) fed by `portsLookupFromDefs`
(`src/use-app-action-defs.ts`), so **read ports through `nodePortsForStep`, never from the step**. `FlowStep.fanOut` (`"parallel"` | `"sequence"`, absent = sequence) is the wire field; the
pure logic lives in `src/flow-fanout.ts`, the editor shows a "Run next nodes" select and a
`.w6w-fanout-badge` (`⇉ N` parallel / `→ N` sequence, aria text from `WorkflowFlowEditor.tsx`) on action
cards. The palette offers `@w6w/control` **Merge**; `aggregate` is hidden from it. Known gaps (that
project's FOLLOWUPS): `ControlNodeCard` has no badge; the badge label and the palette's hidden filter
have no direct unit test; `StepPortsControl` (hidden) would write `out:null` if re-enabled.

**ui-icons (closed 2026-10-07; landed `main` @ `3babb57` / `78ce915`, 2026-10-04).** There is now
a shared icon set: `src/components/icons.tsx` (`IconName`, `iconNames`, `icons`, one `IconVariant`
per entry: fill / stroke / mixed) and `src/components/Icon.tsx` (`Icon({name,size=16,label,
className})`: `currentColor`, decorative = `aria-hidden`, labelled = `role="img"`). Both are
exported from the barrel. `IconButton` takes `icon=`/`iconSize=`/`title=`/`aria-pressed`/
`aria-expanded` and forwards a ref; `children` still win over `icon`. **Add a new glyph as a set
entry; never write an inline `<svg>` in a component.** The deliberate exceptions are
`InternalIcon.tsx` (per-app markup from the node def) and `ServerResources.tsx`'s `Sparkline`
(data-driven) — their docblocks say why. `.w6w-icon` lives in `src/styles/_icon.scss`.
The `HistoryTimeline.test.ts` race described in the gate table is **fixed**
(`fix/history-timeline-flaky` @ `9beb480`). Each JSX test file now has a per-run scratch dir,
and its `after()` cleanup is armed only after the dynamic import resolves. Copy that pattern
in a new JSX-render test. Fact 3's file counts are now 54 + 18
(`ls src/__tests__/*.test.ts | wc -l` / `ls src/components/__tests__/*.test.ts | wc -l` on
`main` @ `88b208b`). Unit suite 694/694 on `88b208b`. `biome check .` reports 7 errors there
(`StepBuilderModal`/`WorkflowFlowEditor` format+imports, `WaitEditor`); none of them exist at
this project's tip `cfaa9fe`, where biome is clean.

**26-10-12-00-steps-metadata (2026-10-13, `proj/26-10-12-00-steps-metadata` @ `e6c7c17`).** This
project carries step metadata (`StepMeta`: which app, version, action and connection a step ran with)
from the engine through the ui:
- **Types.** `StepMeta` (`src/provider.tsx`) is a local structural copy of the engine's type.
  `W6WApi`'s invoke result, `StepTest.lastRunMeta` and `StepStartState.steps[id].meta` gained it as
  optional fields. `W6WApi` is a published contract (see the 26-10-05 entry above), so these are
  additive only.
- **`ExpressionEditorModal` `mode="json-binding"`.** A `json` param, or a `group` param without
  `children`, gets a ƒx (`ParamsForm.tsx`, `mode="json-binding"`). The modal then offers each
  upstream step's **Entire output** plus its fields, and a pick calls `onBind({ $: ref })`, for
  example `{ "$": "steps.<id>.output" }` (`ExpressionEditorModal.tsx`, grep `jsonBinding`). The
  field then renders a bound row (`.w6w-json-binding`) with the ref, **Edit**, **Clear** and a
  resolved preview (`data-testid="json-binding-preview"`). Clear goes back to the literal JSON the
  editor still holds, because the draft is never seeded from a binding (`ParamsForm.tsx`, grep
  `R-18a`). `isDollarPath`/`isDollarExpr` are now exported from `src/resolve-params.ts`. The
  ƒx's UA chrome is stripped by `.w6w-field-labelrow .w6w-expr-fx` (`src/styles/_fx.scss`).
- **Metadata picker group.** A collapsed **Metadata** disclosure (`data-testid="expr-meta-toggle"`,
  `›`/`⌄` glyph) offers the leaves App / App version / Action / Connection ID (`META_LEAVES` in
  `ExpressionEditorModal.tsx`). It shows only for steps with `hasMeta`, which
  `projectStepSources` sets only on external app steps with a non-blank `uses.app`
  (`src/step-preview-state.ts`, grep `hasMeta`). It never shows in json-binding mode. When the step
  has fields, it is stacked under the "N fields" toggle in `.w6w-exprmodal-toggle-stack`.
- **Meta chips** read `<id> meta · <key>` (`src/components/expression-dom.ts`, the table in its
  docblock). Sample values for the preview come from `stepMetaSampleValues`
  (`src/step-preview-state.ts`), which `WorkflowFlowEditor` feeds from each step's latest saved
  test (`lastRunMeta`).
- **Metadata blocks.** `ExecutionLogPanel` renders a Metadata `CodeBlock` after Output when
  `step.meta` is set, and no block otherwise (`src/components/ExecutionLogPanel.tsx`, grep
  `Metadata`). `StepBuilderModal`'s step Test result and `WorkflowFlowEditor`'s canvas test modal
  show the same block after Result.
- Also landed: `src/__tests__/CodeBlock.keys.test.ts` pins that every line and token `CodeBlock`
  renders has a React key (documented in `docs/components/editors.md`).
- Docs: `docs/components/{forms,executions,editors}.md`.
- Known gaps (that project's `FOLLOWUPS.md`): `ActionTestForm` doesn't surface the invoke `meta`
  (F-4). Dropping `meta: latest.lastRunMeta` in the step-test fetch effect survives the suite
  (T3.2.2). The json-binding preview doesn't read `steps.<id>.meta` keys (T3.2.2).

## 26-10-12-02-oauth-fix — `AppPicker` `loadPage`, reducer `retry`

**verified: 2026-10-13** — against `proj/26-10-12-02-oauth-fix` @ `2cfe66a`.

- **`AppPicker` takes an optional `loadPage` prop** (`src/AppPicker.tsx`, `loadPage?:`). It turns the
  paged mode on by itself (`const paged = !supplied && (loadPage !== undefined || …)`) and
  **beats `W6WApi.listAppsPage`** when both exist (`fetchPage`: `const custom = loadPageRef.current`).
  Precedence: `apps` supplied > `loadPage` > `api.listAppsPage` > legacy eager `listApps`. It is called
  with exactly `{ q, cursor, limit, signal }` (never `category` or `compact`) and reuses the picker's
  debounce, stale-generation guard, abort, Load more and Retry.
- **Its identity is held in a ref** (`loadPageRef`), so an inline arrow per render causes no request.
  The converse: changing the loader does not refetch either; remount or change the query to switch.
- **Loaders must be async.** `fetchPage` does `custom({...})` then `request.then(…)`; a loader that
  throws synchronously (rather than returning a rejected promise) is NOT caught and escapes the
  effect. Only a rejected promise or a malformed envelope becomes the retryable error.
- **`app-pages.ts` reducer gained `retry`** (`appsPageReducer`, `case "retry"`): from `"error"` only,
  to `"loading"` when no apps are shown, `"loading-more"` when a list is on screen (apps and cursor kept,
  so the retry resends the SAME cursor); a no-op in every other status. Both Retry buttons in
  `AppPicker.tsx` (`const retry`) dispatch it.
- Tests: `src/__tests__/AppPicker.loader.test.ts`, extended `AppPicker.paged.test.ts`
  and `app-pages.test.ts`. (The loader may now also return `total`; see *Pinned pagination* below.)

## npm packaging and `@w6w/expr` resolution (26-10-14-01-npm-publish-expr-ui)

- **`@w6w/expr` is an npm dependency (`^0.1.1` since 26-10-28-00-updates, `package.json`) and external to the
  build.** `vite.config.ts` lists it in the externals. Inside this repo, `pnpm-workspace.yaml`'s override still links
  `../core/packages/expr` (its comment still says `^0.1.0` — stale comment, the manifest wins). Because it is a
  live link, **a new expr export is usable in ui the moment it exists in the sibling core checkout** — no publish,
  no install — but a published `@w6w/ui` needs that expr version on npm first.
- **That link resolves to source through the `w6w-source` export condition, not to expr's `dist/`.**
  Expr's `package.json` `exports["."]` puts `"w6w-source": "./mod.ts"` first. The opt-ins are:
  - `tsconfig.json` `customConditions`.
  - `vite.config.ts` and `.storybook/vite.config.ts` `resolve.conditions`. Storybook does **not**
    inherit the root vite config, and Vite 6 *replaces* its default conditions when you set them, so
    spread `defaultClientConditions`.
  - `node --conditions=w6w-source` in `pnpm test`.
  - `--conditions=w6w-source` on every `test/*/run.sh` esbuild call.
  - **Trap:** drop any one of these and that gate fails with TS2307 / "Failed to resolve entry". It
    only fails while expr's `dist/` is absent, so gate with it absent.
- **Publishing goes through `pnpm pack`.** `npm publish`/`npm pack` ignore `publishConfig`'s
  main/types/exports and would ship `./src/index.ts`. The steps are:
  1. `pnpm pack`.
  2. `node scripts/assert-packed-manifest.mjs <tgz>`.
  3. `npm publish <tgz> --provenance`, run from `release.yml`.
  - `test/pack-smoke/run.sh` (`UI_TGZ=… [EXPR_TGZ=…]`) is the clean-consumer tsc + vite gate.
  - `release.yml` checks out `w6w-io/w6w-core` as a `core/` sibling for its gates. It skips the
    publish step when the version is already on npm.
- **verified: 2026-10-14** — `vite.config.ts` `output.banner: (chunk) => (chunk.isEntry ? '"use client";' : "")` adds
  `"use client";` to the six entry files only (index/flow/code × mjs/cjs); shared chunks carry no
  banner. `test/pack-smoke/run.sh` asserts both (`== "use client" banner on the six entry files`,
  `shared chunk(s) banner-free`).
- **verified: 2026-10-14** — `color-scheme` is set only on elements whose class list has a token starting `w6w-`:
  `:where([class^="w6w-"]:not(:root), [class*=" w6w-"]:not(:root)) { color-scheme: var(--w6w-scheme); }`
  (`src/styles/_tokens.scss`, the comment above that rule says it never matches `<html>`/`:root` or a
  host `data-theme` wrapper). `--w6w-scheme` inherits. Since 26-10-28-00-updates `Combobox`
  (`src/components/Combobox.tsx`, grep `className="w6w-combobox"`) gives its root `w6w-combobox`, so the root now
  matches that rule and sets `color-scheme: var(--w6w-scheme)`; the caller's `className` goes on the `<input>`.
- **verified: 2026-10-14** — Test rigs:
  - `pnpm test:pack-smoke` (`bash test/pack-smoke/run.sh`) requires `UI_TGZ=<pnpm pack tarball>`
    (`fatal "UI_TGZ is required"`). It builds a Vite + React 18 consumer and a Next `16.4.1` + React 19
    consumer (turbopack and `--webpack`: `for BUILDER in turbopack webpack`), plus a `.scss` probe. It
    installs from npm, so it needs network.
  - `test/host-isolation/run.sh` (`EXPECTED_TESTS` default 13) gates in `HOST_BROWSER=1` mode, using
    host chromium from `~/.cache/ms-playwright/chromium-*`; docker mode needs the
    `mcr.microsoft.com/playwright:v1.60.0-noble` image.
  - Docker mode cannot run from this devcontainer: the rigs bind-mount a mktemp dir, and bind mounts
    resolve on the docker host, not in the devcontainer.
  - The five bare-sass rigs (picker-layout, picker-paging, action-test-form, expr-template, copyable)
    run `"$PKG/node_modules/.bin/sass" --no-source-map --style=expanded "$SRC/styles.scss"` with no
    `--load-path`; none is needed because the published `styles.scss` has no external `@use`.
- **verified: 2026-10-14** — Gate baselines: `NODE_OPTIONS=--experimental-strip-types pnpm test` gives **802 pass / 0
  fail** on Node 22.16 (bare `pnpm test` fails with `ERR_UNKNOWN_FILE_EXTENSION`; fact 3).

verified: 2026-10-14 · against `proj/26-10-14-05-embed-client-kit` @ `e6d9bf0`.

## Pinned pagination (26-10-16-00-pinned-pagination) — `listApps` walks one snapshot, `AppPicker` shows N of M

The server's `GET /apps` now pages a pinned list snapshot (server `docs/reference/pagination.md`).

- **`createW6WApi.listApps` walks ONE snapshot with no page cap** (`src/createW6WApi.ts`, `listApps:`).
  It sends `limit=200` plus the previous page's `nextCursor` verbatim, because the cursor encodes the
  snapshot. It never sends `snapshot`/`offset`. The walk stops when `nextCursor` is absent or
  unchanged. The old 20-page cap is gone. On `ApiError` code `snapshot_expired` (410) or
  `unknown_snapshot` (404) it drops what it gathered and restarts ONCE, and a second expiry throws.
  Tests: `createW6WApi.test.ts` `T3.1.1 A2` (25 pages → 25 requests) and `A3` (restart, second expiry
  throws after exactly 4 requests, other errors throw at once).
- **`createW6WApi` still has no `listAppsPage`** (only `listApps` and `listAppsByIds`), so `AppPicker`
  in a ui-only host takes the legacy eager `listApps` path. `listAppsPage` comes only from a host:
  studio's facade or `@w6w/react`'s adapter (project FOLLOWUPS F-6).
- **`AppPicker` shows "N of M"** in paged mode once a page carries `total`. The markup is
  `<div className="w6w-small w6w-apppicker-count">{pageState.apps.length} of {pageState.total}</div>`.
  `.w6w-apppicker-count` has no SCSS rule: `grep -rn apppicker-count src/styles` → none. The total
  flows `loadPage`/`listAppsPage` result → `page-loaded` action `total?` → `AppsPageState.total`
  (`src/app-pages.ts`). A page without `total` keeps the previous one.
- **Expiry in the picker is detected structurally.** A host loader throws the SDK's own error class,
  never ui's `ApiError`, so `fetchPage` reads `.code`. When a request that carried a cursor fails with
  `snapshot_expired`/`unknown_snapshot`, the picker dispatches `query-changed` (rows dropped) and
  refetches cursorless, once. A cursorless failure is a plain error. Tests: `AppPicker.loader.test.ts`
  `T3.1.1 A5`/`A6`, `AppPicker.paged.test.ts` `T3.1.1 A4`. Gap: the "restart on cursorless expiry"
  mutant is caught only by an unbounded loop (~78 s), with no named test failing (FOLLOWUPS T3.1.1
  F1).
- **Type surface (`src/provider.tsx`):** `ListAppsPageOptions` gained `snapshot?`/`offset?`, and
  `AppsPageResult` gained `snapshot?`, `total?`, `offset?`, `limit?` and `expiresAt?`.
  `@w6w/react`'s adapter hand-copies both types (`wrappers/react/src/adapter.ts`), so change them
  together. `AppPicker`'s `loadPage` prop may return `total?`, and is still called with exactly
  `{ q, cursor, limit, signal }`.

verified: 2026-10-17 · against `proj/26-10-16-00-pinned-pagination` @ `f0cf816` (`NODE_OPTIONS=--experimental-strip-types pnpm test` → 816 pass / 0 fail).

## Workflow nodes + canvas (26-10-22-00-workflow-updates)

- **The editor's model is `nodes[]`.** `FlowWorkflow` carries `nodes: FlowStep[]` and accepts the legacy
  `{ steps: FlowStep[] }` shape on input (`src/flow-types.ts:172,233`; compat tests
  `src/__tests__/flow-nodes-compat.test.ts`). `FlowStep` is still the node type's name; do not read
  "step" in a type name as "`steps[]` is canonical". Expressions resolve `nodes.<id>.output`; the
  `steps.` alias stays valid (`src/resolve-params.ts`, `src/components/expression-template.ts`).
- **Canvas notes + sections.** `FlowCanvas = {notes?, sections?}` (`src/canvas-types.ts`), pure helpers
  in `src/canvas-utils.ts` (`clampCanvas`, `pruneSectionMembers`, `renameSectionMember`), rendered
  BEHIND edges and nodes by `CanvasLayer` (`src/CanvasLayer.tsx`), Markdown through `Markdown`
  (`src/Markdown.tsx`, `react-markdown`, sanitized; `package.json` dependency). Both are exported
  from `src/index.ts`. The engine ignores `canvas`. Limits (`MAX_NOTES`/`MAX_SECTIONS` 200,
  `MAX_NOTE_BYTES` 10240) mirror server `bll/workflow-definition.ts`.
- **Trap: an inline `onSelectionChange` that sets a fresh array re-renders React Flow forever.** React
  Flow re-invokes the handler after every re-render; `WorkflowFlowEditor.tsx` stores only primitive
  selected node and edge ids in `onSelectionChange`. Guard B4 in `test/canvas-layer/canvas-layer-guards.test.cjs` pins it.
- **Trap: the canvas-layer browser gate needs a playwright-core whose browser build is installed.**
  `test/canvas-layer/run.sh` takes `HOST_BROWSER=1 PW_CORE=<playwright-core 1.62.x path>`; this
  lane's `node_modules` carries only `playwright-core@1.60.0` (`ls node_modules/.pnpm | grep
  playwright-core`) whose chromium build 1223 is absent from `~/.cache/ms-playwright`, so point
  `PW_CORE` at a 1.62.x playwright-core (`ls ~/.cache/ms-playwright` lists chromium-1234/1243 only) when
  running it on the host; layer order is a stacking fact jsdom cannot test.

## Canvas editing refinements (2026-10-24)

Verified against the pending canvas diff based on `e7bb08c`: `docs/components/flow-editor.md`,
`src/CanvasLayer.tsx`, `src/WorkflowFlowEditor.tsx`, and `src/note-markdown.ts`. Notes edit in place
and expose color, heading and bold controls in a floating toolbar; section labels and their toolbar
sit outside the frame. Draw section selects members by enclosed node centers. Clicking a port or
dropping a connection on empty canvas opens the node builder. `triggerFieldsOf` reads canonical
`nodes[]` and falls back to legacy `steps[]` (`src/StepBuilderModal.tsx`).

## Model-provider badge + filter in `AppPicker` (26-10-24-02-agents-studio-foundations)

verified: 2026-10-25 · against `proj/26-10-24-02-agents-studio-foundations` @ `58bccaf`.
- `AppSummary.modelProvider?: { modelTypes: string[]; modelFamilies?: string[] }` (`src/types.ts`),
  populated by the server from `manifest.modelProvider`. `modelProviderOf` and `modelProviderBadge`
  (`src/AppPicker.tsx`) test PRESENCE of the field only. They never read `categories`, so an
  undesignated `ai`-category app gets no badge (the eval killed a category mutant; 26-10-24-02
  `evals/T5.1.1.eval.md` criterion 1).
- `AppPicker`'s `providerFilter?: boolean` prop is a client-side presence filter over the loaded list.
  It is opt-in, and no Studio call site enables it (that project's `artifacts/acceptance-live.md`
  findings). The server's `modelProvider`/`modelType`/`modelFamily` query filters do not reach the
  server from `useW6WApi().listAppsPage`: `ListAppsPageOptions` (`src/provider.tsx`) has no field
  for them. Add them there and in `@w6w/react`'s hand copy together (section above).
- Tests: `src/__tests__/AppPicker.provider.test.tsx`, which `pnpm test` does not run (fact 3).
- Package version is `0.2.7` (`package.json` `"version"`).
- **Lane trap:** in a harness lane, the `ui` sibling can be a symlink to the main checkout on `main`.
  A studio gate that resolves `@w6w/ui` through it measures main's ui, not the branch. Check
  `readlink -f ../ui` before trusting a studio result; T6.1.1 ran studio against a `git archive` of the
  integration branch instead (that project's FOLLOWUPS `[T6.1.1/S2b]`).

## 26-10-27-01-unified-credentials-service-accounts update

**verified: 2026-10-27** — against ui `main` @ `02a948f`.
- `ConnectionConfig` gains a credential step (`components/CredentialPicker.tsx`: use existing / create new + binding
  fields) shown iff `auth.serviceAccount` is present AND `W6WApi.listCredentials` + `createCredential` exist; eight new
  OPTIONAL `W6WApi` credential methods (`provider.tsx`). A secret JSON field is a plain textarea branch in
  `AuthFieldsForm` — never `JsonParamField` (it allows expression bindings).
- Baseline: `NODE_OPTIONS=--experimental-strip-types npm test` → **1074 / 0**; `npm run typecheck` 0.

## 26-10-27-00-updates — dark-theme Combobox, trigger half-pill, name hint

**verified: 2026-10-28** — against `proj/26-10-27-00-updates` @ `2e1575e` (T1.1.3 `6b35dee`, `evals/T1.1.3.eval.md`; T1.1.5 `2e1575e`).
- **There is no `--w6w-surface` or `--w6w-hover` token** (`git grep -- '--w6w-surface|--w6w-hover' -- src` → none;
  `src/styles/_tokens.scss`). A `var()` naming one silently falls back, which is how `Combobox` painted a white list in
  dark mode. `Combobox.tsx` `LIST_STYLE` now uses `--w6w-panel`/`--w6w-text`/`--w6w-border` with no fallback, and the
  active row `--w6w-panel-2`; `.w6w-callable-list-body` uses `--w6w-panel`. Use an existing token, never invent one.
- **Trigger nodes are half-pills.** `ControlNodeCard` (`src/WorkflowFlowEditor.tsx`, anchor `function ControlNodeCard`,
  not a line number — `isTrigger` appears in several functions) sets `className="w6w-node-trigger"` and `data-node-kind`
  only when `isTrigger` (trigger/webhook/scheduler); the radius/padding live in `src/styles/_flow.scss`
  `.w6w-flow .w6w-node-trigger`, not inline. Its 14px right inset has no `--w6w-sp-*` step and carries a
  `lint-tokens-allow` comment (FOLLOWUPS: promote to a token). The geometry is pinned only by browser guard B6 in
  `test/canvas-layer/` (`HOST_BROWSER=1`), not by jsdom tests.
- **`ExpressionEditorModal` add-value hint** reads "Letters, digits, and underscores. Must start with a letter or
  underscore. Case-sensitive." (`src/components/ExpressionEditorModal.tsx`, grep `Case-sensitive.`), matching the
  server's `NAME_RE` (server PLANNER, 26-10-27-00-updates section). No test pins the text.
- **Gap — the theme context is not exported.** `ProvidedThemeCtx` lives in `src/theme.ts`; `src/index.ts` exports
  `W6WUIProvider` but no theme context or hook, and `package.json` `exports` allows only `.`, `./flow`, `./code`. A
  nested `W6WUIProvider` therefore cannot inherit an outer provider's JS-side theme (embed works around it with an
  internal context; studio PLANNER, same project). FOLLOWUPS: export it.
- **Trap — `src/styles.css` is generated** by `scripts/build-css.mjs` (fact 2); a styles change commits the
  regenerated file, and `node scripts/build-css.mjs --check` must be clean.
- **Trap — `model-node-parity.test.ts` needs the `../internal-apps` sibling**: a sibling-less extraction shows 2
  env-only failures (contract F5).

## 26-10-28-00-updates — ResultViewer, sandboxed HtmlPreview, persisted test result, combobox width, `Param.when`

**verified: 2026-10-29** — against `proj/26-10-28-00-updates` @ `65e8558` (`@w6w/ui` 0.2.12; evals T0.1.1 r2, T0.1.2,
T0.2.1, T0.3.1, T1.2.1 in `.ai/projects/.work/26-10-28-00-updates/`).
- **`ResultViewer` is the one read-only result display** (`src/components/ResultViewer.tsx`, exported from
  `src/index.ts` with `HtmlPreview`, `HTML_PREVIEW_CSP`, `htmlPreviewSrcDoc` and the `result-format.ts` sniffer
  `detectResultFormat`/`resultCopyText`/`DetectedResult`). It sniffs the ROOT value only (json / html / markdown / xml
  / text); JSON goes to `src/components/JsonTree.tsx` (not exported; native disclosure, text-only children). Adopted by
  every result pane in `ApiCallsPanel.tsx` (bodies only — header panes stay `<pre>`), `ActionTestForm.tsx`,
  `TriggerFillForm.tsx`, `WorkflowFlowEditor.tsx` and `StepBuilderModal.tsx` (`StepTestRun`, `CallableTestRun`,
  `TestRunLogModal`) — `grep -rln ResultViewer src --include=*.tsx`. **Error boxes stay `div.w6w-result.w6w-error`**
  (selected by `ExecutionLogPanel`/`ExpressionEditorModal`/action-test-form guard tests); do not route errors through it.
- **`HtmlPreview` is a trust boundary.** Vendor HTML renders only in `<iframe sandbox="" srcDoc=…>` whose srcdoc begins
  with a CSP meta (`default-src 'none'; … base-uri 'none'; form-action 'none'`) — `src/components/HtmlPreview.tsx`.
  Both halves are load-bearing: `sandbox=""` alone still let img/css/@import/nested-frame beacons reach the network in a
  Chromium probe (`building-blocks-ui.md` "Pinned HTML preview mechanism"). The component, `result-format.ts` and the
  XSS test are pinned byte-exact to `artifacts/pinned/` of that project (`evals/T0.1.1.eval.r2.md` G1). Never
  `dangerouslySetInnerHTML` vendor content; jsdom executes no iframe, so only the host-Chromium gate
  `test/html-preview/html-preview-xss.test.ts` (2/2) proves anything — and it is **in no `package.json` script**
  (`FOLLOWUPS.md` F6). Residual: Firefox/WebKit untested (F7).
- **Size bounds.** `RESULT_RENDER_MAX_CHARS = 262144` (`result-format.ts`) caps the rendered view;
  `RESULT_HIGHLIGHT_MAX_CHARS = 65536` (`ResultViewer.tsx`, `renderSource`) drops Prism for plain `<pre>` above it.
  **Trap paid for:** the first size guard sent oversized input to the highlighted Source path, which took >60 s in Prism
  (eval r1 B1) — a size guard must name the cost of the path it falls back to. Still open (`FOLLOWUPS.md`): `JsonTree`
  has no cycle guard (F9) and no child cap (F11, 1M leaves 18.9 s); adversarial 64 KiB markdown Source ~8.4 s (F10);
  `Markdown`/micromark has no parse budget (F2).
- **`Copyable` hover modifier**: `.w6w-copyable--hover` in `src/styles/_copyable.scss` reveals the button on
  `:hover`/`:focus-within` (always shown under `hover:none`); the unmodified rule is unchanged, so `CodeBlock` users
  keep today's always-visible button. `ResultViewer` owns the one copy button — pass `copyable={false}` to any inner
  `CodeBlock` (`building-blocks-ui.md` T-0.0 table).
- **The step Test tab restores the newest stored run on reopen** (`StepTestRun`, `src/StepBuilderModal.tsx`, grep
  `setRestoredAt`): `listStepTests` rows lacking `lastRunAt`/`lastRunStatus` are skipped, max `lastRunAt` wins,
  non-`succeeded` shows as an error, the label reads "Last run · <time>", hydration never re-persists, and a click on
  Test clears it (`ranRef`). Test: `src/__tests__/StepTestRun.persisted-result.test.ts`. Open: no `onResult` spy, no
  unmount-before-resolve test (FOLLOWUPS T0.3.1); a never-saved workflow still persists nothing (FOLLOWUPS PL-ui).
- **Combobox fills its field and the ƒx toggle sits at the end.** `Combobox`'s root now carries `w6w-combobox`;
  `src/styles/_fields.scss` sets it and its `> input[type="text"]` to `width:100%`, and `src/styles/_fx.scss` lets
  `.w6w-fx-wrap > .w6w-combobox` / `> .w6w-fx-grow` flex-grow. `ParamsForm`'s `ChoiceField` (not `DynamicOptionField`)
  wraps it in `div.w6w-fx-grow`. Pinned by host-Chromium `test/combo-layout/combo-layout.test.ts` (3/3; fails 3/3 on
  base) and jsdom `src/__tests__/ParamsForm.fx-grow.test.ts`. Two CSS mutants survive (redundant in measured layouts)
  and the unscoped `.w6w-combobox > input` rule is unverified against `studio.css` (HV-3) — `evals/T0.2.1.eval.md`.
- **`Param.when` is honoured through `@w6w/expr`, never re-implemented here.** `ParamsForm` (top level, sections,
  groups), `ResolvedParams` and the Test gate `requiredParamsFilled` (`StepBuilderModal.tsx`) map each param through
  `effectiveParam` (grep `effectiveParam(` → `ParamsForm.tsx`, `StepBuilderModal.tsx`, `components/ResolvedParams.tsx`);
  `isParamVisible` delegates to `matchesParamCondition`. `ActionParam.when` is typed from expr's `ParamWhen`
  (`src/types.ts`). Tests: `src/__tests__/ParamsForm.when-overlay.test.ts`, `StepBuilderModal.required-gate.test.ts`.
  **Trap:** the overlay is memoised on `params` identity — tests must hoist `params` out of the render or a
  memo-dropping mutant survives (`evals/T1.2.1.eval.md` r1 M6); the section-child overlay (`SectionField`) is unmemoised
  and unpinned. Gap: a `when.set.options` that opts into `resolveFields` is not honoured — only base options are read
  (FOLLOWUPS PL-cascade).
- **Trap — `pnpm test` needs `NODE_OPTIONS=--experimental-strip-types` on Node 22.16** or every `.ts` test file dies
  with `ERR_UNKNOWN_FILE_EXTENSION` (`building-blocks-ui.md` gates section; fact 3). Unchanged, still paid for again.
- **Trap — merging two ui branches that both touched SCSS:** `src/styles.css` auto-merges textually but must be
  regenerated (`node scripts/build-css.mjs`, then `--check`), never hand-merged; `CHANGELOG.md` `[Unreleased]`
  conflicts are union merges (`outcomes/T0.1.1.outcome.md` "For the merge").
- Pending human visual checks: HV-1/HV-2 (viewer panes, incl. the four panes with no jsdom mount — FOLLOWUPS T0.1.2),
  HV-3 (combobox in real Studio), HV-4 (restored-run time label) — `plan-ui.md`.

## 26-10-30-00-foreach-loop-authoring — authorable For each

**verified: 2026-10-30** — against `proj/26-10-30-00-foreach-loop-authoring` @ `d73b488` (landed on `main`).

- **The loop core is pure and lives in `src/flow-loop.ts`**: body derivation from the canvas-only
  `each` lane (never serialized; the chain on Each item becomes `with.body`), legacy conversion
  (a body-less For each whose success chain is a valid linear non-control chain loads onto Each item
  with a "converted from an older definition" notice; expressions are never rewritten on load),
  `loopRefusal` (connect-time refusals, rendered as a node-anchored `role="alert"`), and lifecycle
  helpers (rename/delete/duplicate/paste/undo keep `body` consistent). Detectors and one-click fixes are
  `src/flow-problems.ts` (`foreach_wrapped_items`, `foreach_body_refs_output`, `loop_body_invalid`);
  `StepProblem` is a discriminated union (`src/step-problems.ts`) — add a code there and in
  `stepProblemTooltip`, or the switch stops being exhaustive.
- **`ActionParam.whole` / `.hidden`**: `items` binds whole (no per-field form), `body` is hidden.
  The picker's Loop group (Current item `foreach.item`, Index `foreach.index`) gets its sample from
  `resolveLoopItems(items, testOutputs)` exported by `step-preview-state.ts`; after-loop fields appear
  as `items.0.<field>`.
- **Trap — mount-order of the three stamp effects in `WorkflowFlowEditor.tsx`**: the runState and
  stepProblems stamp effects MUST be declared after the `initial` reset effect and depend on `initial`,
  or a host passing `stepProblems`/`runState` on first render (or across a workflow swap) loses them
  (T3.2.1; guard G6 pins it).
- **New real-Chromium guard suite** `pnpm test:foreach-loop` (`test/foreach-loop/`, host browser:
  `HOST_BROWSER=1 PW_CORE=<playwright-core>`): **7/7** (G1–G6 + G4b, a real pointer drag from the
  For each's Done handle). Unit suite **1296 pass · 0 fail** on the merged tip (`2f3ebbe`, 2026-10-30).
- The engine now refuses at plan time a body step that reads its own For each's output (D-X4), so a
  ui fixture that deliberately builds that shape (`src/__tests__/flow-loop.test.ts` legacy round trip)
  is a PlanError if fed to `planWorkflow` — expected, not a regression.
