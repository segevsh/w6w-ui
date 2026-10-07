import assert from "node:assert/strict";
import { test } from "node:test";
import { nodePortsForStep, resolvePorts } from "../flow-types.ts";
import type { FlowStep } from "../flow-types.ts";
import { flowToWorkflow } from "../flow-utils.ts";
import { portsLookupFromDefs } from "../use-app-action-defs.ts";

const step = (app: string, action: string, ports?: FlowStep["ports"]): FlowStep =>
  ({ id: "s", uses: { app, action }, ...(ports ? { ports } : {}) }) as FlowStep;

test("field-wise: step in + catalog out", () => {
  const lookup = portsLookupFromDefs({ acme: [{ key: "go", ports: { out: 2 } }] });
  assert.deepEqual(nodePortsForStep(step("acme", "go", { in: 0 }), lookup), { in: 0, out: 2 });
});

test("no declarations => in 1, out Infinity", () => {
  assert.deepEqual(nodePortsForStep(step("acme", "go")), { in: 1, out: Number.POSITIVE_INFINITY });
});

test('"many" at any level is Infinity', () => {
  assert.equal(resolvePorts({ out: "many" }).out, Number.POSITIVE_INFINITY);
  assert.equal(resolvePorts({ in: "many" }).in, Number.POSITIVE_INFINITY);
  const lookup = portsLookupFromDefs({ acme: [{ key: "go", ports: { in: "many" } }] });
  assert.equal(nodePortsForStep(step("acme", "go"), lookup).in, Number.POSITIVE_INFINITY);
});

test("step beats catalog beats default; absent field falls through", () => {
  assert.deepEqual(resolvePorts({ out: 3 }, { in: 2, out: 5 }), { in: 2, out: 3 });
});

test("internal def ports apply when the catalog has none", () => {
  // triggers drop the entry port
  assert.equal(nodePortsForStep(step("@w6w/trigger", "manual")).in, 0);
});

test("catalog ports are never serialized onto the saved workflow", () => {
  const original = { id: "w", name: "w", steps: [step("acme", "go")], edges: [] } as never;
  const nodes = [
    { id: "s", type: "step", position: { x: 0, y: 0 }, data: { step: step("acme", "go") } },
  ] as never;
  const w = flowToWorkflow(original, nodes, []);
  assert.ok(!JSON.stringify(w).includes("ports"));
});
