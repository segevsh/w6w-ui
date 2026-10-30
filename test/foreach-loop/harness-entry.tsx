// foreach-loop browser-gate harness entry. `?fixture=legacy|fixed` mounts the REAL
// WorkflowFlowEditor (compiled from the source tree under test) fed by plain React
// state, records every `onChange` on `window.__changes`, and — like the embed host —
// derives `stepProblems` from `findLoopProblems`. `?fixture=log` mounts the REAL
// ExecutionLogPanel with an I4 For each row. Copied into `<tree>/src/` by run.sh.
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkflowFlowEditor } from "./WorkflowFlowEditor.tsx";
import { ExecutionLogPanel, type ExecutionLogStep } from "./components/ExecutionLogPanel.tsx";
import type { FlowWorkflow } from "./flow-types.ts";
import { findLoopProblems } from "./flow-problems.ts";
import { W6WUIProvider } from "./provider.tsx";

const FIXTURE = new URLSearchParams(location.search).get("fixture") || "legacy";

// F0, written out literally (never derived from code under test).
const TICKETS = [
  { name: "Early bird", sourceId: "src_101", price: 1500, quantity: 40 },
  { name: "General", sourceId: "src_102", price: 2500, quantity: 200 },
  { name: "VIP", sourceId: "src_103", price: 9900, quantity: 15 },
  { name: "Student", sourceId: "src_104", price: 900, quantity: 60 },
  { name: "Group of 5", sourceId: "src_105", price: 10000, quantity: 12 },
  { name: "Backstage", sourceId: "src_106", price: 25000, quantity: 5 },
];

const nodes = (withBody: boolean): FlowWorkflow["nodes"] => [
  {
    id: "create_event_1",
    uses: { app: "stub-events", action: "create-event" },
    position: { x: 0, y: 0 },
  },
  {
    id: "eventbrite_to_cohost_1",
    uses: { app: "stub-source", action: "list-tickets" },
    position: { x: 340, y: 0 },
  },
  {
    id: "for_each_1",
    uses: { app: "@w6w/control", action: "foreach" },
    position: { x: 680, y: 0 },
    with: withBody
      ? { items: "{{ nodes.eventbrite_to_cohost_1.output.tickets }}", body: ["update_event_ticket_1"] }
      : { items: ["{{ nodes.eventbrite_to_cohost_1.output.tickets }}"] },
  },
  {
    id: "update_event_ticket_1",
    uses: { app: "stub-cohost", action: "update-event-ticket" },
    position: { x: 1020, y: 0 },
    with: {
      event: "{{ nodes.create_event_1.output.id }}",
      ticket: withBody ? "{{ foreach.item }}" : "{{ nodes.for_each_1.output }}",
    },
  },
];

const legacy: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_f0",
  name: "f0",
  nodes: nodes(false),
  edges: [
    { from: "create_event_1", to: "eventbrite_to_cohost_1" },
    { from: "eventbrite_to_cohost_1", to: "for_each_1" },
    { from: "for_each_1", to: "update_event_ticket_1" },
  ],
};
const fixed: FlowWorkflow = {
  ...legacy,
  nodes: nodes(true),
  edges: [
    { from: "create_event_1", to: "eventbrite_to_cohost_1" },
    { from: "eventbrite_to_cohost_1", to: "for_each_1" },
  ],
};

const w = window as unknown as { __changes: FlowWorkflow[]; __mounted: boolean };
w.__changes = [];

function Harness() {
  const [value, setValue] = useState<FlowWorkflow>(FIXTURE === "fixed" ? fixed : legacy);
  // The embed host loads `findLoopProblems` through a dynamic import, so its problems feed
  // arrives AFTER the editor's mount effects. Mirror that: a feed present on the very first
  // render is overwritten by the editor's mount-time node reseed (reported as a finding).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);
  const stepProblems = useMemo(() => (ready ? findLoopProblems(value) : undefined), [ready, value]);
  return (
    <div style={{ width: 1200, height: 760 }}>
      <WorkflowFlowEditor
        value={value}
        height="100%"
        stepProblems={stepProblems}
        onChange={(next) => {
          w.__changes.push(JSON.parse(JSON.stringify(next)));
          setValue(next);
        }}
      />
    </div>
  );
}

// I4 row: 6 iterations, failure at index 2, a distinct output literal per iteration.
const iterationRows = (): ExecutionLogStep[] => [
  {
    id: "for_each_1",
    label: "For each",
    status: "failed",
    iterations: TICKETS.map((t, index) => {
      const failed = index === 2;
      return {
        index,
        status: failed ? ("failed" as const) : ("succeeded" as const),
        ...(failed ? { failedNodeId: "update_event_ticket_1" } : {}),
        steps: [
          {
            id: "update_event_ticket_1",
            label: "update_event_ticket_1",
            status: failed ? ("failed" as const) : ("succeeded" as const),
            input: { ticket: t },
            output: { posted: `posted-${t.sourceId}-${t.name}` },
          },
        ],
      };
    }),
    iterationsTotal: 6,
    iterationsFailed: 1,
    iterationsTruncated: false,
  },
];

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
const actionDefs: Record<string, unknown[]> = {
  "stub-events": [{ key: "create-event", params: [], output: [{ key: "id", type: "string" }] }],
  "stub-source": [{ key: "list-tickets", params: [] }],
  "stub-cohost": [
    {
      key: "update-event-ticket",
      title: "Update event ticket",
      params: [
        { key: "event", label: "Event", type: "string", required: true },
        { key: "ticket", label: "Ticket", type: "json", required: true },
      ],
    },
  ],
};
// biome-ignore lint/suspicious/noExplicitAny: the harness stub is intentionally untyped against W6WApi.
const api: any = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (name === "listStepTests")
        return (_wf: string, stepId: string) =>
          Promise.resolve(
            stepId === "eventbrite_to_cohost_1"
              ? [{ id: "st_1", stepId, with: {}, input: {}, lastRunOutput: { tickets: TICKETS } }]
              : [],
          );
      if (name === "getAppActions") return (app: string) => Promise.resolve(actionDefs[app] ?? []);
      return () => Promise.resolve([]);
    },
  },
);
createRoot(mount).render(
  <W6WUIProvider api={api}>
    {FIXTURE === "log" ? (
      <div style={{ width: 900 }}>
        <ExecutionLogPanel steps={iterationRows()} />
      </div>
    ) : (
      <Harness />
    )}
  </W6WUIProvider>,
);
w.__mounted = true;
