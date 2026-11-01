// Run (from packages/ui): node --experimental-strip-types --conditions=w6w-source --test src/__tests__/flow-problems-state.test.ts
// T4.1.3: the editor mirror of the engine's parallel-write warning, proven on the shared fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findStateWriteProblems, stateWriteConflicts } from "../flow-problems.ts";
import type { FlowWorkflowInput } from "../flow-types.ts";
import { type StepProblem, stepProblemTooltip } from "../step-problems.ts";

type Warning = { code: string; nodes: string[]; path: string[] };
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../core/packages/expr/tests/fixtures/state-write-conflicts.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  version: number;
  cases: Array<{ name: string; workflow: FlowWorkflowInput; expect: Warning[] }>;
};

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
const engineOrder = (ws: Warning[]) =>
  [...ws].sort(
    (x, y) =>
      cmp(x.code, y.code) ||
      cmp(x.nodes.join(","), y.nodes.join(",")) ||
      cmp(x.path.join("."), y.path.join(".")),
  );
const projection = (ws: Warning[]) => {
  const out: Record<string, unknown[]> = {};
  for (const w of ws) {
    for (const n of w.nodes) {
      out[n] ??= [];
      out[n].push({ code: w.code, path: w.path, with: w.nodes.filter((x) => x !== n) });
    }
  }
  return out;
};
const parallelOnly = (ws: Warning[]) =>
  engineOrder(ws.filter((w) => w.code === "state_parallel_write"));

test("fixture is not hollow: >= 10 cases, >= 5 parallel expectations, >= 4 with none", () => {
  assert.equal(fixture.version, 1);
  assert.ok(fixture.cases.length >= 10);
  assert.ok(fixture.cases.filter((c) => parallelOnly(c.expect).length > 0).length >= 5);
  assert.ok(fixture.cases.filter((c) => parallelOnly(c.expect).length === 0).length >= 4);
});

for (const c of fixture.cases) {
  test(`fixture ${c.name}`, () => {
    const before = structuredClone(c.workflow);
    const expected = parallelOnly(c.expect);
    assert.deepEqual(stateWriteConflicts(c.workflow), expected);
    assert.deepEqual(findStateWriteProblems(c.workflow), projection(expected));
    assert.deepEqual(c.workflow, before);
  });
}

const W = (nodes: unknown[], edges?: unknown[]): FlowWorkflowInput =>
  ({
    manifestVersion: "2",
    id: "w",
    name: "w",
    nodes,
    ...(edges ? { edges } : {}),
  }) as FlowWorkflowInput;
const run = { app: "acme", action: "run" };
const keyX = { mode: "key", key: "x" };

test("lanes - success vs error lanes of one parallel step are never concurrent", () => {
  const wf = W(
    [
      { id: "a", uses: run, fanOut: "parallel" },
      { id: "b", uses: run, state: keyX },
      { id: "c", uses: run, state: keyX },
    ],
    [
      { from: "a", to: "b" },
      { from: "a", to: "c", when: "error" },
    ],
  );
  assert.deepEqual(stateWriteConflicts(wf), []);
  assert.deepEqual(findStateWriteProblems(wf), {});
});

test("order - three parallel children writing x give [b,c],[b,d],[c,d]; c lists b then d", () => {
  const wf = W(
    [
      { id: "a", uses: run, fanOut: "parallel" },
      { id: "d", uses: run, state: keyX },
      { id: "c", uses: run, state: keyX },
      { id: "b", uses: run, state: keyX },
    ],
    [
      { from: "a", to: "d" },
      { from: "a", to: "c" },
      { from: "a", to: "b" },
    ],
  );
  assert.deepEqual(
    stateWriteConflicts(wf).map((w) => w.nodes),
    [
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
    ],
  );
  const out = findStateWriteProblems(wf);
  assert.deepEqual(out.c, [
    { code: "state_parallel_write", path: ["x"], with: ["b"] },
    { code: "state_parallel_write", path: ["x"], with: ["d"] },
  ]);
});

test("dedupe - a pick writing order.id and order.name parallel to key order gives ONE warning on [order]", () => {
  const wf = W(
    [
      { id: "a", uses: run, fanOut: "parallel" },
      {
        id: "b",
        uses: run,
        state: {
          mode: "pick",
          map: [
            { from: "id", to: "order.id" },
            { from: "name", to: "order.name" },
          ],
        },
      },
      { id: "c", uses: run, state: { mode: "key", key: "order" } },
    ],
    [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
  );
  assert.deepEqual(stateWriteConflicts(wf), [
    { code: "state_parallel_write", nodes: ["b", "c"], path: ["order"] },
  ]);
});

test("legacy steps shape works", () => {
  const wf = {
    manifestVersion: "2",
    id: "w",
    name: "w",
    steps: [
      { id: "a", uses: run, fanOut: "parallel" },
      { id: "b", uses: run, state: keyX },
      { id: "c", uses: run, state: keyX },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
  } as unknown as FlowWorkflowInput;
  assert.deepEqual(stateWriteConflicts(wf), [
    { code: "state_parallel_write", nodes: ["b", "c"], path: ["x"] },
  ]);
  assert.equal(findStateWriteProblems(wf).b?.length, 1);
});

test("garbage input never throws: [] / {}", () => {
  for (const bad of [
    null,
    undefined,
    42,
    "x",
    {},
    { nodes: "nope" },
    { nodes: [null, 3, { id: "a" }] },
    { nodes: [], steps: [] },
    { nodes: [{ id: "a", uses: run, state: { mode: "key" } }], edges: "x" },
  ]) {
    assert.deepEqual(stateWriteConflicts(bad as unknown as FlowWorkflowInput), []);
    assert.deepEqual(findStateWriteProblems(bad as unknown as FlowWorkflowInput), {});
  }
});

test("never mutates: input deep-equals its pre-call clone", () => {
  const wf = W(
    [
      { id: "a", uses: run, fanOut: "parallel" },
      { id: "b", uses: run, state: keyX },
      { id: "c", uses: { app: "@w6w/data", action: "set" } },
    ],
    [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
  );
  const before = structuredClone(wf);
  const out = findStateWriteProblems(wf);
  assert.deepEqual(wf, before);
  assert.deepEqual(out.b, [{ code: "state_parallel_write", path: [], with: ["c"] }]);
});

test("tooltip - root path reads `state`, nested path dotted, many `with` joined with comma-space", () => {
  const p = (path: string[], w: string[]): StepProblem => ({
    code: "state_parallel_write",
    path,
    with: w,
  });
  assert.equal(
    stepProblemTooltip(p([], ["b"])),
    "Writes state at the same time as b — parallel branches don't see each other's writes; the final value follows the workflow's step order",
  );
  assert.equal(
    stepProblemTooltip(p(["order", "id"], ["b", "c"])),
    "Writes state.order.id at the same time as b, c — parallel branches don't see each other's writes; the final value follows the workflow's step order",
  );
  assert.equal("fix" in p([], ["b"]), false);
});
