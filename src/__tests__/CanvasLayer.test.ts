// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/CanvasLayer.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasLayer } from "../CanvasLayer.tsx";
import type { FlowCanvas } from "../canvas-types.ts";

const g = globalThis as unknown as Record<string, unknown>;
g.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM("<!doctype html><html><body></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;

const canvas: FlowCanvas = {
  sections: [
    {
      id: "s1",
      title: "<b>T</b>",
      color: "#112233",
      position: { x: 1, y: 2 },
      size: { width: 30, height: 40 },
      nodes: [],
    },
  ],
  notes: [
    {
      id: "n1",
      color: "#445566",
      position: { x: 5, y: 6 },
      size: { width: 70, height: 80 },
      content: "hello **bold**",
    },
  ],
};

async function mount(viewport: Element | null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(CanvasLayer, { canvas, viewport }));
  });
  return { host };
}

test("portals into the viewport with z-index -2 sections / -1 notes", async () => {
  const vp = document.createElement("div");
  vp.className = "react-flow__viewport";
  document.body.appendChild(vp);
  const { host } = await mount(vp);
  const sections = vp.querySelector<HTMLElement>('[data-testid="w6w-canvas-sections"]');
  const notes = vp.querySelector<HTMLElement>('[data-testid="w6w-canvas-notes"]');
  assert.ok(sections && notes);
  assert.equal(sections.style.zIndex, "-2");
  assert.equal(notes.style.zIndex, "-1");
  assert.equal(host.children.length, 0, "nothing rendered outside the viewport");
  assert.match(notes.innerHTML, /<strong>bold<\/strong>/);
  assert.ok(notes.querySelector(".nopan.nodrag.nowheel"));
});

test("section title is plain text, never HTML", async () => {
  const vp = document.createElement("div");
  document.body.appendChild(vp);
  await mount(vp);
  const title = vp.querySelector(".w6w-canvas-section-title");
  assert.equal(title?.textContent, "<b>T</b>");
  assert.equal(title?.querySelector("b"), null);
});

test("a section keeps no controls in its frame; selecting its label opens the toolbar above it", async () => {
  const vp = document.createElement("div");
  document.body.appendChild(vp);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const changes: FlowCanvas[] = [];
  await act(async () => {
    createRoot(host).render(
      createElement(CanvasLayer, { canvas, viewport: vp, onChange: (c) => changes.push(c) }),
    );
  });
  const frame = vp.querySelector('[data-section-id="s1"]');
  assert.ok(frame);
  assert.equal(frame.querySelector("input, button, [data-testid=section-label]"), null);
  const label = vp.querySelector<HTMLElement>('[data-section-label="s1"]');
  assert.equal(label?.textContent, "<b>T</b>");
  await act(async () => {
    label?.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
  const bar = vp.querySelector('[data-section-toolbar="s1"]');
  assert.ok(bar, "the toolbar replaces the label");
  assert.equal(vp.querySelector('[data-section-label="s1"]'), null);
  assert.equal(
    frame.querySelector('[data-testid="section-toolbar"]'),
    null,
    "toolbar is outside the frame",
  );
  const title = bar.querySelector<HTMLInputElement>('[data-testid="section-title"]');
  assert.equal(title?.value, "<b>T</b>");
  for (const id of ["section-drag", "section-color", "section-delete"]) {
    assert.ok(bar.querySelector(`[data-testid="${id}"]`), `${id} is on the toolbar`);
  }
  assert.ok(frame.classList.contains("selected"));
  assert.equal(changes.length, 0, "selecting is not an edit");
});

test("renders nothing, without throwing, when the viewport is absent", async () => {
  const { host } = await mount(null);
  assert.equal(host.innerHTML, "");
});
