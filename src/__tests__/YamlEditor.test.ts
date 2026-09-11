// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/YamlEditor.test.ts  (Node 24)
//
// Mirrors `JsonEditor.copy.test.ts`'s JSDOM rig verbatim: the recording
// clipboard stub from `src/components/__tests__/Copyable.test.ts:54-60`, and
// the `Window`/`requestAnimationFrame`/`cancelAnimationFrame` trio a
// CodeMirror 6 mount needs, first added at
// `StepEditModal.setup-and-configure.test.ts:8,50-52`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
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

// CodeMirror 6 needs these three (verified necessary + jointly sufficient at
// `WorkflowFlowEditor.test-tab.test.ts:47-58`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { YamlEditor } = await import("../YamlEditor.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

/** Flush the async tick CodeMirror's view creation needs (shimmed RAF above). */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_RAW = readFileSync(path.join(__dirname, "..", "YamlEditor.tsx"), "utf8");
// Comment-stripped, so an absence assertion can't be satisfied by a prose
// mention alone (M1/M4/M5 in the T1.1.1 test plan).
const SRC = SRC_RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("M1 — imports @codemirror/lang-yaml and calls yaml(), never @codemirror/lang-json", () => {
  assert.match(SRC, /from\s+"@codemirror\/lang-yaml"/, "must import from @codemirror/lang-yaml");
  assert.match(SRC, /\byaml\(\)/, "extensions array must call yaml()");
  assert.equal(
    (SRC.match(/@codemirror\/lang-json/g) ?? []).length,
    0,
    "must not reference @codemirror/lang-json anywhere",
  );
});

test("M4 — no lint/lintGutter path, and no yaml-parsing dependency added", () => {
  assert.equal((SRC.match(/\blintGutter\(/g) ?? []).length, 0, "must not call lintGutter(");
  assert.equal((SRC.match(/\blinter\(/g) ?? []).length, 0, "must not call linter(");

  const pkg = readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8");
  const parsed = JSON.parse(pkg) as { dependencies?: Record<string, string> };
  const deps = Object.keys(parsed.dependencies ?? {});
  assert.ok(!deps.includes("yaml"), "package.json must not add a `yaml` dependency");
  assert.ok(!deps.includes("js-yaml"), "package.json must not add a `js-yaml` dependency");
});

test("M5 — the readOnly/editable a11y split survives the mirror", () => {
  assert.match(SRC, /readOnly=\{props\.readOnly\}/, "must pass readOnly={props.readOnly}");
  assert.match(
    SRC,
    /editable=\{!props\.readOnly\}/,
    "must pass editable={!props.readOnly} — CodeMirror's own readOnly leaves contenteditable=true",
  );
});

test("M2/M3 — mount renders with fold gutter, line numbers, and YAML syntax highlighting", async () => {
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(YamlEditor, {
        value: "a: 1\nb:\n  - x",
        onChange: () => {},
      }),
    );
  });
  await settle();

  const editor = container.querySelector(".w6w-yaml-editor");
  assert.ok(editor, "the editor wrapper must render");

  assert.equal(
    container.querySelectorAll(".cm-foldGutter").length,
    1,
    "fold gutter must be present (the intake's expand/collapse ask)",
  );
  assert.equal(
    container.querySelectorAll(".cm-lineNumbers").length,
    1,
    "line numbers must be present",
  );
  assert.ok(
    container.querySelectorAll(".cm-line span").length > 0,
    "YAML text must be syntax-highlighted into spans (a language pack must actually be wired)",
  );

  await act(async () => {
    root.unmount();
  });
});

test("J1 — copyable renders exactly one button, no .w6w-copyable wrapper", async () => {
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(YamlEditor, {
        value: "a: 1",
        onChange: () => {},
        copyable: true,
      }),
    );
  });
  await settle();

  assert.equal(
    container.querySelector(".w6w-copyable"),
    null,
    "no .w6w-copyable element anywhere — this is shape (b), not shape (a)",
  );
  const editor = container.querySelector(".w6w-yaml-editor");
  assert.ok(editor, "the editor wrapper must render");
  const buttons = editor.querySelectorAll("button");
  assert.equal(buttons.length, 1, "exactly one button inside .w6w-yaml-editor");

  await act(async () => {
    root.unmount();
  });
});

test("J2 — without `copyable`, zero buttons render inside .w6w-yaml-editor", async () => {
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(YamlEditor, {
        value: "a: 1",
        onChange: () => {},
      }),
    );
  });
  await settle();

  const editor = container.querySelector(".w6w-yaml-editor");
  assert.ok(editor);
  assert.equal(
    editor.querySelectorAll("button").length,
    0,
    "no copy button unless copyable is set",
  );

  await act(async () => {
    root.unmount();
  });
});
