import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='root'></div>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { WaitEditor } = await import("../WaitEditor.tsx");

test("wait editor switches units, preserves compound durations, and clears conflicting targets", async () => {
  let values: Record<string, unknown> = { duration: "30s" };
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      React.createElement(WaitEditor, {
        values,
        onChange: (next) => {
          values = next;
          render();
        },
      }),
    );
  await React.act(render);
  const change = async (label: string, value: string) => {
    await React.act(() => {
      const select = document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  };
  await change("Duration input", "value");
  assert.equal(
    (document.querySelector('input[aria-label="Duration value"]') as HTMLInputElement).value,
    "30",
  );
  await change("Duration unit", "m");
  assert.equal(values.duration, "30m");
  await change("Duration input", "text");
  values = { duration: "1h30m30s" };
  await React.act(render);
  assert.equal(
    (document.querySelector('option[value="value"]') as HTMLOptionElement).disabled,
    true,
  );
  assert.equal(values.duration, "1h30m30s");
  await change("Wait for", "until");
  assert.equal(values.duration, "");
  assert.ok(document.body.textContent?.includes("Until"));
  await change("Wait for", "duration");
  assert.equal(values.until, "");
  assert.equal(values.duration, "1s");
  await React.act(() => root.unmount());
});
