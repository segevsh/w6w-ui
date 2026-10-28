// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs \
//   --test src/__tests__/AppPicker.provider.test.tsx   (Node 24)
//
// T5.1.1 crit 1 (UI half) — `AppPicker`'s model-provider BADGE and provider
// FILTER. Fixtures are deliberately blunt about the A01/A02 rule: designation
// is the PRESENCE of `modelProvider`, never inferred from `categories`, so the
// category-`ai` app that declares no provider must never show a badge and must
// never appear under the provider filter. jsdom bootstrap mirrors
// `AppPicker.paged.test.ts`'s rig (jsdom + React 18 act), with the app list
// SUPPLIED so every assertion is synchronous — no fetch, no paging.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
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
const { AppPicker } = await import("../AppPicker.tsx");
const { W6WUIProvider } = await import("../provider.tsx");

type FixtureApp = {
  id: string;
  displayName: string;
  categories?: string[];
  modelProvider?: { modelTypes: string[]; modelFamilies?: string[] };
};

/**
 * Four fixtures spanning the descriptor space crit 1 cares about:
 *   - `openai-chat`   designated, types only
 *   - `multi`         designated, types AND families
 *   - `legacy-ai`     category-`ai` but UNDESIGNATED (must stay invisible to
 *                     the provider filter and carry no badge — A01)
 *   - `crm`           not `ai` at all, undesignated
 */
const FIXTURES: FixtureApp[] = [
  {
    id: "openai-chat",
    displayName: "OpenAI Chat",
    categories: ["ai"],
    modelProvider: { modelTypes: ["chat"] },
  },
  {
    id: "multi",
    displayName: "Multi Model",
    categories: ["ai"],
    modelProvider: { modelTypes: ["chat", "embedding"], modelFamilies: ["gpt-4o", "embed-3"] },
  },
  { id: "legacy-ai", displayName: "Legacy AI", categories: ["ai"] },
  { id: "crm", displayName: "CRM", categories: ["crm"] },
];

const api = {
  listApps: async () => {
    throw new Error("supplied apps must not trigger a catalog fetch");
  },
};

function mount(element: React.ReactElement) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  return { container: container as HTMLElement, root, element };
}

/** Render, let every state settle, then hand the container to the assertions. */
async function render(pickerProps: Record<string, unknown>) {
  const h = mount(React.createElement("div"));
  await act(async () => {
    h.root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, {
          onSelectApp: () => {},
          apps: FIXTURES,
          ...pickerProps,
        } as never),
      ),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return h;
}

const cardIds = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-apppicker-card-id")).map((n) =>
    (n.textContent || "").trim(),
  );

/** The bridge-support chips, per card, in DOM order — `text` is `""` when the card has none. */
const bridgeChips = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-apppicker-card")).map((card) => {
    const chip = card.querySelector(".w6w-apppicker-card-bridge");
    return {
      id: (card.querySelector(".w6w-apppicker-card-id")?.textContent || "").trim(),
      text: (chip?.textContent || "").trim(),
      title: chip?.getAttribute("title") ?? null,
    };
  });

const providerToggle = (container: Element) =>
  container.querySelector(".w6w-apppicker-provider-toggle") as HTMLElement | null;

async function click(container: Element, selector: string, label: string) {
  const target = Array.from(container.querySelectorAll(selector)).find(
    (b) => (b.textContent || "").trim().startsWith(label) || b.getAttribute("aria-label") === label,
  ) as HTMLElement | undefined;
  assert.ok(target, `expected a clickable control matching ${selector} / ${label}`);
  await act(async () => {
    target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("cards render no model-provider badge text; designated and undesignated alike", async () => {
  const h = await render({});
  // All four cards render (the badge does not filter anything by itself).
  assert.deepEqual(cardIds(h.container).sort(), ["crm", "legacy-ai", "multi", "openai-chat"]);
  // The "Model provider — …" badge text is gone everywhere.
  assert.ok(!(h.container.textContent ?? "").includes("Model provider —"));
  assert.equal(h.container.querySelectorAll(".w6w-apppicker-card-provider").length, 0);
  const cards = Array.from(h.container.querySelectorAll(".w6w-apppicker-card"));
  const legacy = cards.find((c) =>
    (c.querySelector(".w6w-apppicker-card-id")?.textContent || "").includes("legacy-ai"),
  );
  assert.ok(legacy, "the undesignated category-ai card must still be listed");
  assert.equal(
    legacy.querySelectorAll(".w6w-apppicker-card-provider").length,
    0,
    "an undesignated category-ai app never shows the provider badge",
  );
  await act(async () => h.root.unmount());
});

test("host-supplied bridgeSupport: 'Bridge supported' chip, and 'unsupported' with its reason as text and title", async () => {
  const h = await render({
    bridgeSupport: new Map<string, { supported: boolean; reason?: string }>([
      ["multi", { supported: true }],
      ["openai-chat", { supported: false, reason: "no_connection" }],
    ]),
  });
  assert.deepEqual(
    bridgeChips(h.container).filter((chip) => chip.text !== ""),
    [
      { id: "multi", text: "Bridge supported", title: "Bridge supported" },
      { id: "openai-chat", text: "unsupported — no_connection", title: "no_connection" },
    ],
    "one chip per lookup entry, carrying the reason as its text AND its title",
  );
  // Apps with no lookup entry stay bare — "unknown" is not "unsupported".
  assert.deepEqual(
    bridgeChips(h.container).filter((chip) => chip.id === "legacy-ai"),
    [{ id: "legacy-ai", text: "", title: null }],
  );
  await act(async () => h.root.unmount());
});

test("no bridge chip at all without the prop (the pre-A6 render is unchanged)", async () => {
  const h = await render({});
  assert.deepEqual(
    bridgeChips(h.container).map((chip) => chip.text),
    ["", "", "", ""],
    "no prop, no chip — every existing call site renders exactly as before",
  );
  assert.equal(h.container.querySelectorAll(".w6w-apppicker-card-bridge").length, 0);
  await act(async () => h.root.unmount());
});

test("no provider filter is offered unless the caller opts in (existing call sites unchanged)", async () => {
  const h = await render({ categoryFilter: true });
  assert.equal(providerToggle(h.container), null);
  assert.deepEqual(cardIds(h.container).length, 4);
  await act(async () => h.root.unmount());
});

test("the provider filter sits beside the category chips and narrows to designated apps only", async () => {
  const h = await render({ categoryFilter: true, providerFilter: true });
  // Beside, not instead of: the toggle lives in the same chip row as the
  // category chips, and the row exists because BOTH kinds of control do.
  const row = h.container.querySelector(".w6w-apppicker-cats");
  assert.ok(row, "one chip row hosts both filters");
  const toggle = providerToggle(h.container);
  assert.ok(toggle, "the provider toggle is rendered");
  assert.ok(row?.contains(toggle));
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.match(toggle.textContent ?? "", /Model providers \(2\)/);
  const catChip = Array.from(row?.querySelectorAll(".w6w-apppicker-chip") ?? []).find((c) =>
    (c.textContent || "").trim().startsWith("AI"),
  );
  assert.ok(catChip, "the category chips are still there");

  await click(h.container, ".w6w-apppicker-provider-toggle", "Filter to model providers");
  assert.equal(providerToggle(h.container)?.getAttribute("aria-pressed"), "true");
  // A01: `legacy-ai` is category-`ai` but undesignated — the provider filter
  // must not be a category filter, so it stays out.
  assert.deepEqual(cardIds(h.container), ["multi", "openai-chat"]);
  assert.ok(!cardIds(h.container).includes("legacy-ai"));
  await act(async () => h.root.unmount());
});

test("composing provider + category filters still excludes the undesignated ai app", async () => {
  const h = await render({ categoryFilter: true, providerFilter: true });
  // Category `ai` alone: the undesignated fixture is still there.
  await click(h.container, ".w6w-apppicker-chip", "AI");
  assert.deepEqual(cardIds(h.container), ["legacy-ai", "multi", "openai-chat"]);
  // Adding the provider filter drops it — the two filters compose.
  await click(h.container, ".w6w-apppicker-provider-toggle", "Filter to model providers");
  assert.deepEqual(cardIds(h.container), ["multi", "openai-chat"]);

  // Combined to nothing (`crm` is not a provider): the combined empty state
  // names the filters, and `Clear filters` resets BOTH of them plus the search.
  await click(h.container, ".w6w-apppicker-chip", "AI");
  await click(h.container, ".w6w-apppicker-chip", "CRM");
  const empty = Array.from(h.container.querySelectorAll("p")).find((p) =>
    (p.textContent || "").includes("No apps match"),
  );
  assert.equal(cardIds(h.container).length, 0);
  assert.ok(empty, "the combined empty state replaces the grid");
  await click(h.container, "button", "Clear filters");
  assert.deepEqual(cardIds(h.container).sort(), ["crm", "legacy-ai", "multi", "openai-chat"]);
  assert.equal(providerToggle(h.container)?.getAttribute("aria-pressed"), "false");
  await act(async () => h.root.unmount());
});
