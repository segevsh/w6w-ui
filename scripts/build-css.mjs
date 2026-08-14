/**
 * Compiles `src/styles.scss` → `src/styles.css`.
 *
 * `src/styles.css` is GENERATED but COMMITTED, on purpose. The package exports
 * it as `@w6w/ui/styles.css`, and studio consumes this package as a live
 * `link:../ui` source link — so a gitignored build artifact would leave a clean
 * checkout with no stylesheet at all, and a stale one would silently ship the
 * previous design (the same trap `dist/` sets for `@w6w/sdk`; see the root
 * CLAUDE.md). Committing it keeps every consumer working with no Sass
 * toolchain of its own; `--check` is what stops it going stale.
 *
 *   node scripts/build-css.mjs            # write src/styles.css
 *   node scripts/build-css.mjs --check    # exit 1 if it is out of date
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
const entry = join(root, "src", "styles.scss");
const target = join(root, "src", "styles.css");

const BANNER = `/* GENERATED FILE — DO NOT EDIT.
 *
 * Compiled from src/styles.scss by scripts/build-css.mjs (\`pnpm build:css\`).
 * Edit the .scss partials under src/styles/ instead; \`pnpm check:css\` fails
 * if this file has drifted from them.
 */
`;

const compiled = BANNER + sass.compile(entry, { style: "expanded", sourceMap: false }).css.trimEnd() + "\n";

if (process.argv.includes("--check")) {
  let current;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    console.error("check:css — src/styles.css is missing. Run `pnpm build:css`.");
    process.exit(1);
  }
  if (current !== compiled) {
    console.error(
      "check:css — src/styles.css is out of date with src/styles.scss.\n" +
        "Run `pnpm build:css` and commit the result.",
    );
    process.exit(1);
  }
  console.log("check:css — src/styles.css is up to date.");
} else {
  writeFileSync(target, compiled);
  console.log(`build:css — wrote ${compiled.split("\n").length} lines to src/styles.css`);
}
