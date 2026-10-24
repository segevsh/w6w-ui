// canvas-layer browser-gate harness entry. Mounts the REAL WorkflowFlowEditor
// (compiled from the source tree under test) in a real Chromium page, controlled
// by plain React state, and records every `onChange` emission on
// `window.__changes` so the tests can assert against the emitted definition.
// Copied into `<tree>/src/__canvas_layer_entry.tsx` and bundled by run.sh; the
// relative imports resolve against the tree under test ($UI_SRC).
import { Profiler, useState } from "react";
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
// c's centre); note n1 covers c's centre; section s_over's label (above the frame's
// top-left corner) also covers c's centre. s_empty is a member-less frame whose
// interior must let a pane click through.
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
        title: "Overlapping section",
        color: "#6366f1",
        position: { x: 330, y: 40 },
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

// "app": one lone registry-app step (not an internal @w6w/* node), the shape a
// freshly added catalog action takes — the port drag-out flows run against it.
const app: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_app",
  name: "app",
  nodes: [
    { id: "p", uses: { app: "notion", action: "admin-create-permission-group" }, position: { x: 0, y: 0 } },
  ],
  edges: [],
};

const base = FIXTURE === "flows" ? flows : FIXTURE === "app" ? app : overlap;
const initial: FlowWorkflow = SAVE_POSITION
  ? base
  : { ...base, settings: { ...(base.settings ?? {}), savePosition: false } };

const w = window as unknown as {
  __changes: FlowWorkflow[];
  __mounted: boolean;
  __commits: number;
};
w.__changes = [];
// Every commit of the editor tree. A host that feeds `onChange` straight back into `value` (this
// one, and Studio) must SETTLE: a render loop shows up here as a count that keeps climbing while
// nothing is being done to the page.
w.__commits = 0;

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
    <Profiler
      id="editor"
      onRender={() => {
        w.__commits++;
      }}
    >
      <Harness />
    </Profiler>
  </W6WUIProvider>,
);
w.__mounted = true;
