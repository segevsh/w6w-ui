// Run (from packages/ui): node --experimental-strip-types --conditions=w6w-source --test src/__tests__/flow-state.test.ts
// T4.1.1: the pure "Write to state" decisions (absence defaults, R14, seeds, visibility, round trip).
import assert from "node:assert/strict";
import { test } from "node:test";
import { type StateWriteConfig, validateStateConfig } from "@w6w/expr";
import {
  STATE_MODES,
  STATE_MODE_LABELS,
  seedStateWrite,
  setStateWrite,
  stateWriteFor,
  stateWriteVisible,
} from "../flow-state.ts";
import type { FlowStep, FlowWorkflow } from "../flow-types.ts";
import { type StepNode, flowToWorkflow } from "../flow-utils.ts";

const APP: FlowStep = { id: "fetch_1", uses: { app: "acme", action: "run" }, with: { a: 1 } };
const SET: FlowStep = { id: "set_1", uses: { app: "@w6w/data", action: "set" } };

test("labels pinned, in mode order", () => {
  assert.deepEqual([...STATE_MODES], ["off", "root", "key", "pick", "append"]);
  assert.deepEqual(
    STATE_MODES.map((m) => STATE_MODE_LABELS[m]),
    ["Off", "Merge at root", "Under a key", "Pick fields", "Append"],
  );
});

test("stateWriteFor: R14 default (Set data → root, others → off), explicit wins", () => {
  assert.deepEqual(stateWriteFor(APP), { mode: "off" });
  assert.deepEqual(stateWriteFor(SET), { mode: "root" });
  assert.deepEqual(stateWriteFor({ ...SET, state: { mode: "off" } }), { mode: "off" });
  assert.deepEqual(stateWriteFor({ ...APP, state: { mode: "key", key: "x" } }), {
    mode: "key",
    key: "x",
  });
});

test("setStateWrite: Off is absence on an ordinary step; root is absence on Set data; off on Set data kept", () => {
  const withKey: FlowStep = { ...APP, state: { mode: "key", key: "x" } };
  const off = setStateWrite(withKey, { mode: "off" });
  assert.equal("state" in off, false);
  assert.deepEqual(off.with, { a: 1 });
  assert.deepEqual(withKey.state, { mode: "key", key: "x" }, "input not mutated");
  assert.deepEqual(setStateWrite(APP, { mode: "root" }).state, { mode: "root" });
  assert.equal(
    "state" in setStateWrite({ ...SET, state: { mode: "off" } }, { mode: "root" }),
    false,
  );
  assert.deepEqual(setStateWrite(SET, { mode: "off" }).state, { mode: "off" });
});

test("seedStateWrite: every seed is valid and named after the step", () => {
  for (const m of STATE_MODES) {
    const seed = seedStateWrite(APP, m);
    assert.equal(seed.mode, m);
    assert.deepEqual(validateStateConfig(seed), [], m);
  }
  assert.deepEqual(seedStateWrite(APP, "key"), { mode: "key", key: "fetch_1" });
  assert.deepEqual(seedStateWrite(APP, "pick"), {
    mode: "pick",
    map: [{ from: "", to: "fetch_1" }],
  });
  assert.deepEqual(seedStateWrite(APP, "append"), { mode: "append", path: "fetch_1" });
});

test("stateWriteVisible: app steps, triggers and script yes; If and For each no", () => {
  assert.equal(stateWriteVisible(APP), true);
  assert.equal(
    stateWriteVisible({ uses: { app: "@w6w/trigger", action: "manual", trigger: true } }),
    true,
  );
  assert.equal(stateWriteVisible({ uses: { app: "@w6w/script", action: "run" } }), true);
  assert.equal(stateWriteVisible({ uses: { app: "@w6w/control", action: "if" } }), false);
  assert.equal(stateWriteVisible({ uses: { app: "@w6w/control", action: "foreach" } }), false);
});

test("five-mode round trip through flowToWorkflow; no state key when absent; initialState untouched", () => {
  const configs: StateWriteConfig[] = [
    { mode: "off" },
    { mode: "root" },
    { mode: "key", key: "order.id" },
    {
      mode: "pick",
      map: [
        { from: "id", to: "order.id" },
        { from: "", to: "raw" },
      ],
    },
    { mode: "append", path: "items", from: "line" },
  ];
  const nd = (st: FlowStep): StepNode =>
    ({
      id: st.id,
      type: "step",
      position: { x: 0, y: 0 },
      data: { step: st, isInternal: false },
    }) as StepNode;
  const initialState = { seed: { a: [1, 2] } };
  for (const c of configs) {
    const st: FlowStep = { ...APP, state: c };
    const wf = {
      id: "w",
      name: "w",
      nodes: [st],
      edges: [],
      initialState,
    } as unknown as FlowWorkflow;
    const out = flowToWorkflow(wf, [nd(st)], []);
    assert.deepEqual(out.nodes[0].state, c);
    assert.deepEqual(out.initialState, { seed: { a: [1, 2] } });
  }
  const wf = { id: "w", name: "w", nodes: [APP], edges: [] } as unknown as FlowWorkflow;
  assert.equal("state" in flowToWorkflow(wf, [nd(APP)], []).nodes[0], false);
});
