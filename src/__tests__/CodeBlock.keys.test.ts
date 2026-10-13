// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/CodeBlock.keys.test.ts
//
// B-1 regression: `CodeBlock` must raise no React missing/duplicate-key warning.
// prism-react-renderer v2's `getLineProps` / `getTokenProps` return NO `key`, so
// CodeBlock's explicit line and token keys are load-bearing: drop or flatten one
// and a repeated/blank line warns. The render goes through `react-dom/client` +
// `act` under JSDOM, NOT `renderToStaticMarkup`: the server renderer never runs
// duplicate-key detection, so a constant line key would pass there.
import assert from "node:assert/strict";
import { test } from "node:test";
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
g.matchMedia =
  dom.window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
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
const { CodeBlock } = await import("../CodeBlock.tsx");

const KEY_WARNING = /unique "key" prop|same key/;

/** Render `node`, unmount, and return every console.error line matching the key warnings. */
async function keyWarnings(make: () => unknown): Promise<string[]> {
  const seen: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    seen.push(args.map(String).join(" "));
  };
  try {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(make() as never);
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    console.error = original;
  }
  return seen.filter((l) => KEY_WARNING.test(l));
}

test("positive control: a keyless list is captured", async () => {
  const w = await keyWarnings(() =>
    React.createElement("div", null, [
      React.createElement("span", null, "a"),
      React.createElement("span", null, "b"),
    ]),
  );
  assert.ok(w.length >= 1, "keyless list must warn");
});

test("positive control: a duplicate-key list is captured", async () => {
  const w = await keyWarnings(() =>
    React.createElement("div", null, [
      React.createElement("span", { key: "k" }, "a"),
      React.createElement("span", { key: "k" }, "b"),
    ]),
  );
  assert.ok(w.length >= 1, "duplicate-key list must warn");
});

const SOURCES: Record<string, string> = {
  repeated: "a\na\na",
  "zero-length token": "a\n\nb",
  "blank runs": "x\n\n\ny\n\n",
  empty: "",
  whitespace: "   \n\t\n  ",
  json: '{\n  "a": 1,\n  "b": [1, 2],\n  "c": {\n    "d": null\n  }\n}',
  continuation: "curl -X POST \\\n  -H 'a: b' \\\n  https://example.test",
};
const LANGUAGES = ["plaintext", "bash", "json", "typescript", "python", "go"] as const;

test("CodeBlock raises no key warning across sources x languages x line numbers x copyable", async () => {
  let rendered = 0;
  for (const [name, code] of Object.entries(SOURCES)) {
    for (const language of LANGUAGES) {
      for (const showLineNumbers of [false, true]) {
        for (const copyable of [false, true]) {
          const w = await keyWarnings(() =>
            React.createElement(CodeBlock, { code, language, showLineNumbers, copyable }),
          );
          rendered++;
          assert.deepEqual(
            w,
            [],
            `${name} / ${language} / numbers=${showLineNumbers} / copy=${copyable}`,
          );
        }
      }
    }
  }
  assert.equal(rendered, Object.keys(SOURCES).length * LANGUAGES.length * 4, "matrix fully ran");
});
