// canvas-layer browser-gate harness entry. Mounts the REAL WorkflowFlowEditor
// (compiled from the source tree under test) in a real Chromium page, controlled
// by plain React state, and records every `onChange` emission on
// `window.__changes` so the tests can assert against the emitted definition.
// Copied into `<tree>/src/__canvas_layer_entry.tsx` and bundled by run.sh; the
// relative imports resolve against the tree under test ($UI_SRC).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkflowFlowEditor } from "./WorkflowFlowEditor.tsx";
import type { FlowWorkflow } from "./flow-types.ts";
import { W6WUIProvider } from "./provider.tsx";

const params = new URLSearchParams(location.search);
const SAVE_POSITION = params.get("save") !== "0";
const READ_ONLY = params.get("ro") === "1";
const FIXTURE = params.get("fixture") || "overlap";

const step = (id: string, x: number, y: number) => ({
  id,
  uses: { app: "@w6w/http", action: "request" },
  position: { x, y },
});

// "overlap": node c sits between a and b on the a->b edge (its line runs through
// c's centre); note n1 covers c's centre; section s_over's title (top-left of the
// frame) also covers c's centre. s_empty is a member-less frame whose interior
// (below its title) must let a pane click through.
const overlap: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_canvas",
  name: "canvas",
  nodes: [step("a", 0, 0), step("c", 300, 0), step("b", 600, 0)],
  edges: [{ from: "a", to: "b" }],
  canvas: {
    sections: [
      {
        id: "s_over",
        title: "Over",
        color: "#6366f1",
        position: { x: 330, y: 10 },
        size: { width: 400, height: 160 },
        nodes: [],
      },
      {
        id: "s_empty",
        title: "Empty",
        color: "#22c55e",
        position: { x: 0, y: 100 },
        size: { width: 300, height: 140 },
        nodes: [],
      },
    ],
    notes: [
      {
        id: "n1",
        color: "#facc15",
        position: { x: 260, y: -40 },
        size: { width: 320, height: 160 },
        content: "**hello**",
      },
    ],
  },
};

// "flows": four plain nodes and no canvas — the add/group/drag/prune flows
// build everything up from the toolbar.
const flows: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_flows",
  name: "flows",
  nodes: [step("a", 0, 0), step("b", 0, 200), step("c", 400, 0), step("d", 400, 200)],
  edges: [
    { from: "a", to: "b" },
    { from: "c", to: "d" },
  ],
};

const base = FIXTURE === "flows" ? flows : overlap;
const initial: FlowWorkflow = SAVE_POSITION
  ? base
  : { ...base, settings: { ...(base.settings ?? {}), savePosition: false } };

const w = window as unknown as { __changes: FlowWorkflow[]; __mounted: boolean };
w.__changes = [];

function Harness() {
  const [value, setValue] = useState<FlowWorkflow>(initial);
  return (
    <div style={{ width: 1200, height: 760 }}>
      <WorkflowFlowEditor
        value={value}
        readOnly={READ_ONLY}
        height="100%"
        onChange={(next) => {
          w.__changes.push(JSON.parse(JSON.stringify(next)));
          setValue(next);
        }}
      />
    </div>
  );
}

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
// biome-ignore lint/suspicious/noExplicitAny: the harness stub is intentionally untyped against W6WApi.
const api: any = new Proxy({}, { get: () => () => Promise.resolve([]) });
createRoot(mount).render(
  <W6WUIProvider api={api}>
    <Harness />
  </W6WUIProvider>,
);
w.__mounted = true;
