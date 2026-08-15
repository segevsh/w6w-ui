/**
 * Compiles the package's Sass entrypoints to the .css files it exports.
 *
 *   src/styles.scss → src/styles.css    (@w6w/ui/styles.css — the whole library)
 *   src/code.scss   → src/code.css      (@w6w/ui/code.css   — <CodeBlock> only)
 *
 * Each generated .css is COMMITTED, on purpose. The package exports them, and
 * studio consumes this package as a live `link:../ui` source link — so a
 * gitignored build artifact would leave a clean checkout with no stylesheet at
 * all, and a stale one would silently ship the previous design (the same trap
 * `dist/` sets for `@w6w/sdk`; see the root CLAUDE.md). Committing them keeps
 * every consumer working with no Sass toolchain of its own; `--check` is what
 * stops them going stale.
 *
 *   node scripts/build-css.mjs            # write both .css files
 *   node scripts/build-css.mjs --check    # exit 1 if either is out of date
 *
 * The banner is prepended here rather than authored into the Sass, so that the
 * .scss stays the clean source and the "do not edit" notice can never end up
 * being the thing someone edits.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every entrypoint, by basename. Add one here and both modes pick it up. */
const ENTRIES = ["styles", "code"];

const banner = (name) => `/* GENERATED FILE — DO NOT EDIT.
 *
 * Compiled from src/${name}.scss by scripts/build-css.mjs (\`pnpm build:css\`).
 * Edit the .scss partials under src/styles/ instead; \`pnpm check:css\` fails
 * if this file has drifted from them.
 */
`;

const check = process.argv.includes("--check");
let stale = false;

for (const name of ENTRIES) {
  const target = join(root, "src", `${name}.css`);
  const compiled =
    banner(name) +
    sass.compile(join(root, "src", `${name}.scss`), { style: "expanded", sourceMap: false }).css.trimEnd() +
    "\n";

  if (!check) {
    writeFileSync(target, compiled);
    console.log(`build:css — wrote ${compiled.split("\n").length} lines to src/${name}.css`);
    continue;
  }

  let current;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    console.error(`check:css — src/${name}.css is missing. Run \`pnpm build:css\`.`);
    stale = true;
    continue;
  }
  if (current !== compiled) {
    console.error(
      `check:css — src/${name}.css is out of date with src/${name}.scss.\n` +
        "Run `pnpm build:css` and commit the result.",
    );
    stale = true;
    continue;
  }
  console.log(`check:css — src/${name}.css is up to date.`);
}

// Every entry is reported before exiting: a run that bailed on the first stale
// file would hide a second one, and the fix for both is the same one command.
if (stale) process.exit(1);
