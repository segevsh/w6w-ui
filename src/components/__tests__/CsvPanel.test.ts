// Run (from ui): node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/CsvPanel.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { CsvPanel } = await import("../CsvPanel.tsx");
const { CSV_MAX_BYTES, CSV_TOO_LARGE_COPY } = await import("../../data-stores/data-store-view.ts");

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => root.render(React.createElement(CsvPanel, { result: null, ...props } as never)));
  return container;
}
const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`);

function pick(c: Element, size: number) {
  const input = tid(c, "csv-file") as HTMLInputElement;
  const file = new dom.window.File(["x"], "rows.csv", { type: "text/csv" });
  Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  return { input, file };
}

test("a file over CSV_MAX_BYTES calls only onRefuse, with the copy", () => {
  const imported: unknown[] = [];
  const refused: string[] = [];
  const c = mount({
    onImport: (f: unknown) => imported.push(f),
    onRefuse: (m: string) => refused.push(m),
  });
  pick(c, CSV_MAX_BYTES + 1);
  assert.deepEqual(imported, []);
  assert.deepEqual(refused, [CSV_TOO_LARGE_COPY]);
});

test("a file at the limit calls only onImport, and the input is reset", () => {
  const imported: unknown[] = [];
  const refused: string[] = [];
  const c = mount({
    onImport: (f: unknown) => imported.push(f),
    onRefuse: (m: string) => refused.push(m),
  });
  const { input, file } = pick(c, CSV_MAX_BYTES);
  assert.deepEqual(imported, [file]);
  assert.deepEqual(refused, []);
  assert.equal(input.value, "");
});

test("Export calls onExport and is disabled while busy", () => {
  let exported = 0;
  const c = mount({ onExport: () => exported++ });
  const btn = tid(c, "csv-export") as HTMLButtonElement;
  assert.equal(btn.textContent, "Export CSV");
  act(() => {
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(exported, 1);
  const busy = mount({ onExport: () => exported++, busy: true });
  const b2 = tid(busy, "csv-export") as HTMLButtonElement;
  assert.equal(b2.disabled, true);
  act(() => {
    b2.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(exported, 1);
});

test("result renders in csv-result, with an error class when not ok", () => {
  assert.equal(tid(mount({}), "csv-result"), null);
  const ok = tid(mount({ result: { ok: true, message: "Imported 3 rows." } }), "csv-result");
  assert.equal(ok?.textContent, "Imported 3 rows.");
  assert.equal(ok?.classList.contains("w6w-error"), false);
  const bad = tid(mount({ result: { ok: false, message: "Line 2 bad." } }), "csv-result");
  assert.equal(bad?.textContent, "Line 2 bad.");
  assert.equal(bad?.classList.contains("w6w-error"), true);
  assert.ok(document.querySelector('[aria-label="Import CSV"]'));
});
