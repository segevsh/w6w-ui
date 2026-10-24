// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/BudgetMeter.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
import type { BudgetMeterProps } from "../BudgetMeter.tsx";

const { BudgetMeter } = await import("../BudgetMeter.tsx");

function render(props: BudgetMeterProps): {
  container: HTMLElement;
  root: unknown;
  el: HTMLElement;
} {
  const container = document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(BudgetMeter, { testId: "budget", ...props }));
  });
  const el = container.querySelector('[data-testid="budget"]') as HTMLElement;
  return { container, root, el };
}

function unmount(root: unknown): void {
  act(() => (root as { unmount: () => void }).unmount());
}

test("renders used/limit with an accessible meter role and aria values", () => {
  const { el, root } = render({ label: "Model budget", used: 320, limit: 1000 });
  assert.equal(el.getAttribute("role"), "meter");
  assert.equal(el.getAttribute("aria-label"), "Model budget");
  assert.equal(el.getAttribute("aria-valuenow"), "320");
  assert.equal(el.getAttribute("aria-valuemax"), "1000");
  assert.equal(el.getAttribute("aria-valuemin"), "0");
  assert.equal(el.getAttribute("aria-valuetext"), "320 / 1000");
  assert.match(el.textContent ?? "", /Model budget/);
  assert.match(el.textContent ?? "", /320 \/ 1000/);
  const used = el.querySelector(".w6w-budget-meter-used") as HTMLElement;
  assert.equal(used.style.width, "32%");
  unmount(root);
});

test("format is applied to every printed number", () => {
  const { el, root } = render({
    label: "Spend",
    used: 4.25,
    limit: 10,
    format: (n: number) => `$${n.toFixed(2)}`,
  });
  assert.equal(el.querySelector(".w6w-budget-meter-value")?.textContent, "$4.25 / $10.00");
  assert.equal(el.getAttribute("aria-valuenow"), "4.25");
  assert.equal(el.getAttribute("aria-valuetext"), "$4.25 / $10.00");
  unmount(root);
});

test("reserved segment renders only when reserved > 0, and never overflows the track", () => {
  const withoutReserved = render({ label: "Budget", used: 300, limit: 1000 });
  assert.equal(withoutReserved.el.querySelector(".w6w-budget-meter-reserved"), null);
  unmount(withoutReserved.root);

  const zeroReserved = render({ label: "Budget", used: 300, limit: 1000, reserved: 0 });
  assert.equal(zeroReserved.el.querySelector(".w6w-budget-meter-reserved"), null);
  unmount(zeroReserved.root);

  const withReserved = render({ label: "Budget", used: 300, limit: 1000, reserved: 200 });
  const segment = withReserved.el.querySelector(".w6w-budget-meter-reserved") as HTMLElement;
  assert.ok(segment, "expected a distinct reserved segment");
  assert.equal(segment.style.width, "20%");
  // used(30%) + reserved(20%) stay inside the track.
  assert.equal(
    (withReserved.el.querySelector(".w6w-budget-meter-used") as HTMLElement).style.width,
    "30%",
  );
  unmount(withReserved.root);

  // A reservation larger than the remaining head-room is clipped to it.
  const clipped = render({ label: "Budget", used: 800, limit: 1000, reserved: 500 });
  const clippedSegment = clipped.el.querySelector(".w6w-budget-meter-reserved") as HTMLElement;
  assert.equal(clippedSegment.style.width, "20%");
  unmount(clipped.root);
});

test("over-limit state class appears at and past the limit only", () => {
  const under = render({ label: "Budget", used: 999, limit: 1000 });
  assert.ok(!under.el.classList.contains("w6w-budget-meter-over"));
  unmount(under.root);

  const atLimit = render({ label: "Budget", used: 1000, limit: 1000 });
  assert.ok(atLimit.el.classList.contains("w6w-budget-meter-over"));
  assert.equal(
    (atLimit.el.querySelector(".w6w-budget-meter-used") as HTMLElement).style.width,
    "100%",
  );
  unmount(atLimit.root);

  const over = render({ label: "Budget", used: 1500, limit: 1000 });
  assert.ok(over.el.classList.contains("w6w-budget-meter-over"));
  // The bar stops at the track's width; the numbers still tell the truth.
  assert.equal(
    (over.el.querySelector(".w6w-budget-meter-used") as HTMLElement).style.width,
    "100%",
  );
  assert.match(over.el.textContent ?? "", /1500 \/ 1000/);
  unmount(over.root);
});

test("styling: token-only colours, no hard-coded hex", () => {
  const css = readFileSync(new URL("../../styles/_budget-meter.scss", import.meta.url), "utf8");
  assert.match(css, /var\(--w6w-accent\)/);
  assert.match(css, /var\(--w6w-danger\)/);
  assert.match(css, /var\(--w6w-panel-2\)/);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, "the meter must not hard-code a colour");
  assert.equal(/rgba?\(/.test(css), false, "the meter must not hard-code a colour");
});
