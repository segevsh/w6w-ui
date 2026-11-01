import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanvasSection, FlowCanvas } from "../canvas-types.ts";
import { relayoutFlow } from "../flow-layout.ts";
import type { FlowWorkflow } from "../flow-types.ts";
import { type StepNode, flowToWorkflow, relayoutNodes, workflowToFlow } from "../flow-utils.ts";

function workflow(ids: string[], edges: [string, string][]): FlowWorkflow {
  return {
    id: "layout",
    name: "Layout",
    manifestVersion: "2",
    nodes: ids.map((id) => ({ id, uses: { app: "@w6w/script", action: "run" } })),
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}

const orderEmail = workflow(
  [
    "order_placed",
    "data",
    "get_entry",
    "render_subject",
    "render_body",
    "send",
    "manual",
    "get_order",
  ],
  [
    ["order_placed", "data"],
    ["manual", "get_order"],
    ["get_order", "data"],
    ["data", "get_entry"],
    ["get_entry", "render_subject"],
    ["render_subject", "render_body"],
    ["render_body", "send"],
  ],
);

function node(nodes: StepNode[], id: string) {
  const found = nodes.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

function section(id: string, members: string[]): CanvasSection {
  return {
    id,
    title: "Parse template",
    color: "#6366f1",
    nodes: members,
    position: { x: 300, y: 400 },
    size: { width: 800, height: 300 },
  };
}

function assertMembership(nodes: StepNode[], sections: CanvasSection[]) {
  for (const s of sections) {
    for (const n of nodes) {
      const width = n.measured?.width ?? n.width ?? 200;
      const height = n.measured?.height ?? n.height ?? 64;
      const inside =
        n.position.x >= s.position.x &&
        n.position.y >= s.position.y &&
        n.position.x + width <= s.position.x + s.size.width &&
        n.position.y + height <= s.position.y + s.size.height;
      const overlaps =
        n.position.x < s.position.x + s.size.width &&
        n.position.x + width > s.position.x &&
        n.position.y < s.position.y + s.size.height &&
        n.position.y + height > s.position.y;
      assert.equal(
        s.nodes.includes(n.id) ? inside : overlaps,
        s.nodes.includes(n.id),
        `${s.id}: ${n.id}`,
      );
    }
  }
}

test("unequal trigger paths stay separate until their real join, regardless of edge order", () => {
  for (const edges of [orderEmail.edges, orderEmail.edges?.slice().reverse()]) {
    const graph = workflowToFlow({ ...orderEmail, edges });
    const nodes = relayoutNodes(graph.nodes, graph.edges);
    const placed = node(nodes, "order_placed").position;
    const manual = node(nodes, "manual").position;
    const getOrder = node(nodes, "get_order").position;
    const data = node(nodes, "data").position;
    assert.equal(placed.x, manual.x, "both triggers are entry points");
    assert.notEqual(placed.y, manual.y);
    assert.equal(getOrder.y, manual.y, "Get order stays on the manual path");
    assert.equal(data.y, placed.y, "the direct trigger edge bypasses Get order");
    assert.ok(data.x > getOrder.x);
    assert.deepEqual(
      nodes.map((n) => n.position),
      graph.nodes.map((n) => n.position),
    );
    assert.deepEqual(flowToWorkflow(orderEmail, nodes, graph.edges).edges, edges);
  }
});

test("a bypass edge stays clear of the longer branch it rejoins", () => {
  const wf = workflow(
    ["start", "middle", "join"],
    [
      ["start", "middle"],
      ["middle", "join"],
      ["start", "join"],
    ],
  );
  const { nodes } = workflowToFlow(wf);
  assert.equal(node(nodes, "start").position.y, node(nodes, "join").position.y);
  assert.notEqual(node(nodes, "middle").position.y, node(nodes, "join").position.y);
});

test("forked branches and disconnected chains reserve distinct rows through their descendants", () => {
  const wf = workflow(
    ["a", "b", "c", "other", "d", "e", "tail"],
    [
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["b", "e"],
      ["other", "tail"],
    ],
  );
  const { nodes } = workflowToFlow(wf);
  const row = (id: string) => node(nodes, id).position.y;
  assert.equal(row("a"), row("b"));
  assert.equal(row("b"), row("d"));
  assert.ok(row("e") < row("c"), "the second branch clears the first branch's whole subtree");
  assert.ok(row("other") > row("c"));
  assert.equal(row("other"), row("tail"));
});

test("measured card dimensions leave space between columns and independent paths", () => {
  const graph = workflowToFlow(orderEmail);
  const measured = graph.nodes.map((n) => ({
    ...n,
    measured: { width: n.id === "order_placed" ? 350 : 180, height: 140 },
  }));
  const { nodes } = relayoutFlow(measured, graph.edges, {});
  const placed = node(nodes, "order_placed");
  assert.ok(node(nodes, "get_order").position.x > placed.position.x + 350);
  assert.ok(node(nodes, "manual").position.y > placed.position.y + 140);
});

test("Parse template follows only its members; Data and Send stay outside", () => {
  const graph = workflowToFlow(orderEmail);
  const canvas = { sections: [section("parse", ["get_entry", "render_subject", "render_body"])] };
  const before = structuredClone({ ...graph, canvas });
  const next = relayoutFlow(graph.nodes, graph.edges, canvas);
  assert.deepEqual({ ...graph, canvas }, before, "input graph was not mutated");
  assert.deepEqual(next.canvas.sections?.[0].nodes, canvas.sections[0].nodes);
  assertMembership(next.nodes, next.canvas.sections ?? []);
  assert.deepEqual(
    relayoutFlow(next.nodes, graph.edges, next.canvas),
    next,
    "repeating layout is stable",
  );
});

test("sections spanning an unrelated node move with their members instead of enclosing it", () => {
  const graph = workflowToFlow(
    workflow(
      ["a", "b", "c", "d", "e"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
      ],
    ),
  );
  const canvas: FlowCanvas = {
    sections: [section("outer", ["a", "c", "e"]), section("inner", ["b", "d"])],
  };
  const next = relayoutFlow(graph.nodes, graph.edges, canvas);
  assertMembership(next.nodes, next.canvas.sections ?? []);
  const [a, b] = next.canvas.sections ?? [];
  assert.ok(a && b);
  assert.ok(
    a.position.y + a.size.height < b.position.y || b.position.y + b.size.height < a.position.y,
  );
  assert.deepEqual(
    next.canvas.sections?.map((s) => s.nodes),
    canvas.sections?.map((s) => s.nodes),
  );
});

test("notes, empty sections and missing members survive layout unchanged", () => {
  const graph = workflowToFlow(orderEmail);
  const empty = section("empty", ["deleted"]);
  const canvas: FlowCanvas = {
    notes: [
      {
        id: "note",
        color: "yellow",
        content: "Keep this",
        position: { x: 800, y: 40 },
        size: { width: 300, height: 120 },
      },
    ],
    sections: [section("parse", ["get_entry", "render_subject", "render_body", "missing"]), empty],
  };
  const next = relayoutFlow(graph.nodes, graph.edges, canvas);
  assert.deepEqual(next.canvas.notes, canvas.notes);
  assert.deepEqual(next.canvas.sections?.[1], empty);
  assert.deepEqual(next.canvas.sections?.[0].nodes, canvas.sections?.[0].nodes);
  const parse = next.canvas.sections?.[0];
  assert.ok(parse && parse.position.y > 160, "the section also clears the note");
  assert.deepEqual(relayoutFlow([], [], {}), { nodes: [], canvas: {} });
});
