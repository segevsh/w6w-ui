// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/theme.test.ts  (Node 24)
//
// Covers the new `provided` precedence step `detectTheme`/`useEffectiveTheme`
// gained for `<W6WUIProvider theme>` (provider.tsx) — sits between the
// explicit per-component prop and the pre-existing `data-theme`-on-`<html>`/
// OS-preference fallback. Mirrors DeleteButton.test.ts:1-46's JSDOM/`act` setup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;

let prefersDark = false;
function makeMatchMedia() {
  return (query: string) => ({
    matches: query.includes("dark") && prefersDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
g.matchMedia = makeMatchMedia();
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;

class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver =
  (dom.window as unknown as Record<string, unknown>).MutationObserver ?? FakeMutationObserver;
(dom.window as unknown as Record<string, unknown>).MutationObserver = g.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { detectTheme, useEffectiveTheme, ProvidedThemeCtx } = await import("../theme.ts");

test("detectTheme — explicit prop wins over everything, including a provider value", () => {
  assert.equal(detectTheme("dark", "light"), "dark");
});

test("detectTheme — provider `theme` wins over data-theme on <html> and OS preference", () => {
  document.documentElement.setAttribute("data-theme", "dark");
  prefersDark = true;
  assert.equal(detectTheme(undefined, "light"), "light");
  document.documentElement.removeAttribute("data-theme");
  prefersDark = false;
});

test("detectTheme — falls through to data-theme on <html> when no explicit/provided value", () => {
  document.documentElement.setAttribute("data-theme", "dark");
  assert.equal(detectTheme(undefined, undefined), "dark");
  document.documentElement.removeAttribute("data-theme");
});

test("detectTheme — falls through to OS prefers-color-scheme as the last resort", () => {
  prefersDark = true;
  assert.equal(detectTheme(undefined, undefined), "dark");
  prefersDark = false;
  assert.equal(detectTheme(undefined, undefined), "light");
});

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("useEffectiveTheme — reads ProvidedThemeCtx (what <W6WUIProvider theme> sets) over an OS dark preference", async () => {
  prefersDark = true;
  document.documentElement.removeAttribute("data-theme");
  const { root } = mountRoot();
  const seen: string[] = [];
  function Probe() {
    seen.push(useEffectiveTheme());
    return null;
  }
  await act(async () => {
    root.render(
      React.createElement(
        ProvidedThemeCtx.Provider,
        { value: "light" },
        React.createElement(Probe),
      ),
    );
  });
  assert.equal(seen.at(-1), "light");
  await act(async () => {
    root.unmount();
  });
  prefersDark = false;
});

test("useEffectiveTheme — with no provider in the tree, still resolves OS preference as before (backward compatible)", async () => {
  prefersDark = true;
  document.documentElement.removeAttribute("data-theme");
  const { root } = mountRoot();
  const seen: string[] = [];
  function Probe() {
    seen.push(useEffectiveTheme());
    return null;
  }
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  assert.equal(seen.at(-1), "dark");
  await act(async () => {
    root.unmount();
  });
  prefersDark = false;
});

// --- T3.1.1: native-control contrast. Static, over the COMPILED styles.css
// (mirrors scale-tokens.test.ts): a native <select> popup takes its background
// from `color-scheme`, its option text from our tokens, so the two must be
// declared together.
function topLevelBlocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const walk = (src: string) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open === -1) break;
      const selector = src
        .slice(i, open)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      if (selector.startsWith("@")) walk(body);
      else out.push({ selector, body });
      i = j;
    }
  };
  walk(css);
  return out;
}

test("styles.css — token blocks declare no color-scheme; only non-root selectors do (host <html> is never themed)", () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"),
    "utf8",
  );
  const blocks = topLevelBlocks(css);
  const tokenBlocks = blocks.filter((b) => /--w6w-text\s*:/.test(b.body));
  assert.equal(tokenBlocks.length, 4);
  for (const b of tokenBlocks) {
    assert.doesNotMatch(b.body, /color-scheme\s*:/, `${b.selector}: token block sets color-scheme`);
  }
  const schemeBlocks = blocks.filter((b) => /(?:^|[;\s])color-scheme\s*:/.test(b.body));
  const value = (b: { body: string }) => /color-scheme\s*:\s*([^;]+);/.exec(b.body)?.[1].trim();
  // A selector in the list that could match the root element itself.
  const matchesRoot = (sel: string) =>
    sel.split(/,(?![^(]*\))/).some((part) => {
      const p = part.trim();
      if (/^:where\(:root\)$|^:root$|^html\b/.test(p)) return true;
      // bare `[data-theme=…]` with no descendant combinator and no :not(:root)
      return /^:where\(\[data-theme[^\]]*\]\)$|^\[data-theme[^\]]*\]$/.test(p);
    });
  for (const b of schemeBlocks) {
    assert.ok(!matchesRoot(b.selector), `${b.selector}: color-scheme on a root-matching selector`);
  }
  // Each token block carries the inherited `--w6w-scheme`, so the nearest themed ancestor wins.
  assert.deepEqual(
    tokenBlocks.map((b) => /--w6w-scheme\s*:\s*([^;]+);/.exec(b.body)?.[1].trim()),
    ["light", "dark", "light", "dark"],
  );
  // Every color-scheme declaration reads that property; none hard-codes a scheme.
  assert.ok(schemeBlocks.length > 0);
  for (const b of schemeBlocks) {
    assert.equal(
      value(b),
      "var(--w6w-scheme)",
      `${b.selector}: color-scheme not from --w6w-scheme`,
    );
  }
  assert.ok(
    schemeBlocks.some((b) => b.selector.includes("[class*=w6w-]")),
    "scheme is declared on every w6w- component root, not a hand-picked list",
  );
});

test("styles.css — an option/optgroup rule paints token text on the panel background", () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"),
    "utf8",
  );
  const rule = topLevelBlocks(css).find(
    (b) => /(^|[\s,])option(\s*,|$)/.test(b.selector) && /optgroup/.test(b.selector),
  );
  assert.ok(rule, "no rule with option and optgroup in its selector list");
  assert.match(rule.body, /(^|[;\s])color\s*:\s*var\(--w6w-text\)/);
  assert.match(rule.body, /background-color\s*:\s*var\(--w6w-panel\)/);
});
