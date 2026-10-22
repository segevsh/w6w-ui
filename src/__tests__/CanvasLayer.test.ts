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

test("renders nothing, without throwing, when the viewport is absent", async () => {
  const { host } = await mount(null);
  assert.equal(host.innerHTML, "");
});
