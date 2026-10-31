// Run: node --test src/__tests__/router-ports.test.ts  (Node 24, type-stripped)
//
// Router port layout (human report, 2026-10-31): route ports sit ON the card's
// right edge like every other output port, the fallback takes the bottom edge
// (the error port's slot), three right-edge ports fit the natural height, and
// each one past that adds a fixed step. Handle ids stay `route:<id>`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ROUTER_PORT_STEP,
  ROUTER_PORTS_AT_BASE_HEIGHT,
  type RouterRoute,
  routeHandle,
  routerPortLayout,
} from "../flow-types.ts";

const routes = (n: number): RouterRoute[] => [
  ...Array.from({ length: n }, (_, i) => ({ id: `route_${i + 1}`, label: `Route ${i + 1}` })),
  { id: "default", default: true },
];

test("three routes fit the natural height, evenly spaced on the right edge", () => {
  const layout = routerPortLayout(routes(3));
  assert.equal(ROUTER_PORTS_AT_BASE_HEIGHT, 3);
  assert.equal(layout.minHeight, undefined, "no height change at 3 routes");
  assert.deepEqual(
    layout.right.map((p) => p.top),
    [`${(0.5 / 3) * 100}%`, "50%", `${(2.5 / 3) * 100}%`],
  );
  assert.deepEqual(
    layout.right.map((p) => p.label),
    ["Route 1", "Route 2", "Route 3"],
  );
  assert.equal(routerPortLayout(routes(1)).right[0].top, "50%");
  assert.equal(routerPortLayout(routes(2)).minHeight, undefined);
});

test("the fallback takes the bottom edge, not the right", () => {
  const layout = routerPortLayout(routes(2));
  assert.deepEqual(layout.bottom, {
    id: "default",
    handleId: "route:default",
    label: "Fallback",
  });
  assert.ok(!layout.right.some((p) => p.id === "default"));
  // A fallback stored anywhere in the list still goes to the bottom.
  const first = routerPortLayout([{ id: "default", default: true }, { id: "a" }]);
  assert.equal(first.bottom?.id, "default");
  assert.deepEqual(
    first.right.map((p) => p.id),
    ["a"],
  );
  assert.equal(routerPortLayout([{ id: "a" }]).bottom, undefined);
});

test("five routes make the card taller by a fixed step per extra port", () => {
  const four = routerPortLayout(routes(4)).minHeight;
  const five = routerPortLayout(routes(5)).minHeight;
  assert.equal(four, 4 * ROUTER_PORT_STEP);
  assert.equal(five, 5 * ROUTER_PORT_STEP);
  assert.ok(five !== undefined && four !== undefined && five - four === ROUTER_PORT_STEP);
  assert.ok(ROUTER_PORT_STEP <= 20, "growth stays modest");
  assert.equal(routerPortLayout(routes(5)).right.length, 5);
});

test("handle ids are unchanged, so saved edges still resolve", () => {
  const layout = routerPortLayout(routes(5));
  for (const port of [...layout.right, layout.bottom]) {
    assert.ok(port);
    assert.equal(port.handleId, routeHandle(port.id));
    assert.match(port.handleId, /^route:/);
  }
});

test("the card renders route handles on its own edges, with no fan-out connector", () => {
  const source = readFileSync(
    new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname,
    "utf8",
  );
  const start = source.indexOf("function ControlNodeCard(");
  const card = source.slice(start, source.indexOf("\nfunction ", start + 1));
  assert.ok(start > 0, "ControlNodeCard not found");
  assert.ok(!card.includes("w6w-router-port-link"), "no fan-out connector lines");
  assert.match(card, /routerPortLayout\(routes\)/);
  // Right-edge route handles and the bottom fallback handle are ordinary PortHandles.
  assert.match(
    card,
    /routerPorts\.right\.map\(\(port\) => \(\s*<PortHandle[\s\S]*?position=\{Position\.Right\}[\s\S]*?id=\{port\.handleId\}/,
  );
  assert.match(
    card,
    /<PortHandle[\s\S]*?position=\{Position\.Bottom\}[\s\S]*?id=\{routerPorts\.bottom\.handleId\}/,
  );
  // PortHandle no longer pushes a labelled handle off the card edge.
  assert.ok(!source.includes("calc(100% + 28px)"), "handles stay on the node edge");
});
