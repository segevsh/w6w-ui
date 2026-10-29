// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ResultViewer.test.ts  (Node 24)
//
// Rig = Copyable.test.ts's header, including its `Object.defineProperty(globalThis, "navigator", …)`
// block and `stubClipboard` — jsdom implements no Clipboard API at all, so R7 proves
// the STATE MACHINE (the exact bytes handed to `writeText`), never that bytes
// reached a system clipboard. jsdom also executes no iframe, so R3 proves only
// that the payload's markup is not in THIS document — the real-Chromium claim
// (no script runs, no request leaves) is `test/html-preview/html-preview-xss.test.ts`.
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
const { ResultViewer } = await import("../ResultViewer.tsx");
const { HTML_PREVIEW_CSP } = await import("../HtmlPreview.tsx");
const { RESULT_RENDER_MAX_CHARS } = await import("../result-format.ts");

/** Installs a stub clipboard `writeText`, recording every call. */
function stubClipboard() {
  const calls: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        calls.push(text);
      },
    },
    configurable: true,
  });
  return calls;
}

async function mount(value: unknown) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ResultViewer, { value }));
  });
  return { container, root };
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

function byText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  assert.ok(found, `no button labelled ${text}`);
  return found as HTMLButtonElement;
}

function openStates(container: HTMLElement): boolean[] {
  return Array.from(container.querySelectorAll("details.w6w-json-node")).map(
    (d) => (d as HTMLDetailsElement).open,
  );
}

const HTML_PAYLOAD =
  "<!doctype html><html><body><h1>vendor page</h1><script>window.__pwned=1</script></body></html>";

test("R1 — json: 3 nodes, depth-2 open, collapsed text still in the DOM", async () => {
  const { container, root } = await mount({ a: { b: { c: "deep-leaf" } }, n: 1 });

  assert.ok(container.querySelector('[data-format="json"]'), "root must announce data-format=json");
  assert.equal(container.querySelectorAll("details.w6w-json-node").length, 3);
  assert.deepEqual(openStates(container), [true, true, false]);
  assert.ok(
    (container.textContent ?? "").includes("deep-leaf"),
    "collapsed text must stay in the DOM",
  );
  assert.equal(container.querySelectorAll(".w6w-result").length, 0, "never class .w6w-result");

  await act(async () => {
    root.unmount();
  });
});

test("R2 — Expand all opens every node; Collapse all leaves only the root open", async () => {
  const { container, root } = await mount({ a: { b: { c: "deep-leaf" } }, n: 1 });

  await click(byText(container, "Expand all"));
  assert.deepEqual(openStates(container), [true, true, true]);

  await click(byText(container, "Collapse all"));
  assert.deepEqual(openStates(container), [true, false, false]);

  await act(async () => {
    root.unmount();
  });
});

test("R3 — html renders only inside the sandboxed iframe; Source is inert source", async () => {
  const { container, root } = await mount(HTML_PAYLOAD);

  assert.equal(container.querySelectorAll("iframe.w6w-html-preview").length, 1);
  const iframe = container.querySelector("iframe.w6w-html-preview");
  assert.ok(iframe);
  assert.equal(iframe.getAttribute("sandbox"), "");
  // The payload is a srcdoc string, never this document's markup.
  assert.equal(container.querySelector(".w6w-result-viewer script, .w6w-result-viewer h1"), null);
  assert.equal(container.querySelectorAll(".w6w-result").length, 0, "never class .w6w-result");

  await click(byText(container, "Source"));
  assert.equal(container.querySelectorAll("iframe.w6w-html-preview").length, 0);
  const block = container.querySelector(".w6w-code-block");
  assert.ok(block, "source view must be a code block");
  assert.ok((block.textContent ?? "").includes("<h1>"), "source must show the raw markup");

  await act(async () => {
    root.unmount();
  });
});

test("R4 — markdown renders through Markdown; Source shows the raw text", async () => {
  const { container, root } = await mount("# Title-marker\n\n- a\n- b");

  const h1 = container.querySelector(".w6w-result-viewer h1");
  assert.ok(h1, "rendered markdown must produce a real heading");
  assert.equal((h1.textContent ?? "").trim(), "Title-marker");

  await click(byText(container, "Source"));
  assert.equal(
    container.querySelector(".w6w-result-viewer h1"),
    null,
    "source view renders no heading",
  );
  const block = container.querySelector(".w6w-code-block");
  assert.ok(block);
  assert.ok((block.textContent ?? "").includes("# Title-marker"));

  await act(async () => {
    root.unmount();
  });
});

test("R5 — xml is highlighted source, with no render path and no toggle", async () => {
  const { container, root } = await mount("<a><b>1</b></a>");

  assert.equal(container.querySelector("[data-format]")?.getAttribute("data-format"), "xml");
  assert.ok(container.querySelector(".w6w-code-block"), "xml must be shown as source");
  assert.equal(container.querySelectorAll("iframe").length, 0, "xml is never rendered");
  assert.equal(
    container.querySelectorAll("[data-mode]").length,
    0,
    "xml has no Rendered/Source toggle",
  );

  await act(async () => {
    root.unmount();
  });
});

test("R6 — an over-limit html string never renders: note + source only", async () => {
  const big = `<!doctype html><html><body>${"x".repeat(RESULT_RENDER_MAX_CHARS)}</body></html>`;
  const { container, root } = await mount(big);

  assert.equal(container.querySelectorAll("iframe").length, 0, "over the cap: never an iframe");
  assert.equal(
    container.querySelectorAll("[data-mode]").length,
    0,
    "over the cap: no toggle offered",
  );
  assert.ok(container.querySelector(".w6w-result-viewer-note"), "the reader must be told why");

  await act(async () => {
    root.unmount();
  });
});

test("R7 — the hover copy button writes the pretty JSON exactly", async () => {
  const calls = stubClipboard();
  const { container, root } = await mount({ n: 1 });

  const wrap = container.querySelector(".w6w-copyable--hover");
  assert.ok(wrap, "the copy affordance must carry the hover modifier");
  const button = wrap.querySelector('button[aria-label="Copy result"]');
  assert.ok(button, "one copy button, at the top-right of the wrapper");
  assert.equal(container.querySelectorAll('button[aria-label="Copy result"]').length, 1);

  await click(button);
  assert.deepEqual(calls, ['{\n  "n": 1\n}']);

  await act(async () => {
    root.unmount();
  });
});

test("R8 — HTML_PREVIEW_CSP is the pinned string, verbatim", async () => {
  assert.equal(
    HTML_PREVIEW_CSP,
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
  );
});
