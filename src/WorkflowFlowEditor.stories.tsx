import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SAMPLE_APPS, fakeApi } from "../.storybook/fixtures.ts";
import { WorkflowFlowEditor, type WorkflowFlowEditorProps } from "./WorkflowFlowEditor.tsx";
import type { FlowWorkflow } from "./flow-types.ts";
import { W6WUIProvider } from "./provider.tsx";
import type { RunState } from "./run-visuals.ts";

const SAMPLE_WORKFLOW: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_demo",
  name: "onboarding",
  displayName: "Onboarding email",
  nodes: [
    { id: "trigger", uses: { app: "@w6w/webhook", action: "receive" } },
    {
      id: "send",
      uses: { app: "sendgrid", action: "send-email", connection: "c1" },
      with: { to: "ada@example.com" },
    },
    { id: "notify", uses: { app: "slack", action: "post-message" } },
  ],
  edges: [
    { from: "trigger", to: "send" },
    { from: "send", to: "notify" },
  ],
};

const EMPTY_WORKFLOW: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_empty",
  name: "empty",
  nodes: [],
};

/** A step that already failed, one that already succeeded, one not yet reached. */
const SAMPLE_RUN_STATE: RunState = {
  status: "failed",
  steps: {
    trigger: { status: "succeeded" },
    send: { status: "failed" },
  },
};

/** Controlled component needs owned state — this is "renders sample data",
 *  no play functions (`WorkflowFlowEditor.*` own interaction coverage). */
function FlowDemo(
  props: Omit<WorkflowFlowEditorProps, "value" | "onChange"> & { value: FlowWorkflow },
) {
  const [value, setValue] = useState(props.value);
  return <WorkflowFlowEditor {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Editors/WorkflowFlowEditor",
  component: WorkflowFlowEditor,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <W6WUIProvider api={fakeApi()}>
        <Story />
      </W6WUIProvider>
    ),
  ],
  args: {
    value: SAMPLE_WORKFLOW,
    onChange: () => {},
    apps: SAMPLE_APPS,
    height: 480,
  },
  render: (args) => <FlowDemo {...args} />,
} satisfies Meta<typeof WorkflowFlowEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 3 steps, 2 edges — a small representative graph. */
export const Populated: Story = {};

/** No nodes at all — the canvas's empty state. */
export const Empty: Story = {
  args: { value: EMPTY_WORKFLOW },
};

/** Pans/zooms stay enabled; every other interaction is disabled. */
export const ReadOnly: Story = {
  args: { readOnly: true },
};

/** One node fanning out to two: the badge shows on the card, and "Run next nodes" is enabled. */
export const ParallelFanOut: Story = {
  args: {
    value: {
      ...SAMPLE_WORKFLOW,
      nodes: [
        SAMPLE_WORKFLOW.nodes[0],
        { ...SAMPLE_WORKFLOW.nodes[1], fanOut: "parallel" },
        SAMPLE_WORKFLOW.nodes[2],
        { id: "log", uses: { app: "slack", action: "post-message" } },
      ],
      edges: [
        { from: "trigger", to: "send" },
        { from: "send", to: "notify" },
        { from: "send", to: "log" },
      ],
    },
  },
};

/** A legacy For each (steps wired after it, no `body`): converted on load to a loop body, so
 *  the card shows Each item / Done handles, the body step is tinted and badged, and the
 *  "converted from an older definition" notice shows. */
export const ForEachLoop: Story = {
  args: {
    value: {
      ...SAMPLE_WORKFLOW,
      nodes: [
        { id: "create_event_1", uses: { app: "cohost", action: "create-event" } },
        { id: "eventbrite_to_cohost_1", uses: { app: "eventbrite", action: "to-cohost" } },
        {
          id: "for_each_1",
          uses: { app: "@w6w/control", action: "foreach" },
          with: { items: ["{{ nodes.eventbrite_to_cohost_1.output.tickets }}"] },
        },
        {
          id: "update_event_ticket_1",
          uses: { app: "cohost", action: "update-event-ticket" },
          with: {
            event: "{{ nodes.create_event_1.output.id }}",
            ticket: "{{ nodes.for_each_1.output }}",
          },
        },
      ],
      edges: [
        { from: "create_event_1", to: "eventbrite_to_cohost_1" },
        { from: "eventbrite_to_cohost_1", to: "for_each_1" },
        { from: "for_each_1", to: "update_event_ticket_1" },
      ],
    },
  },
};

/** Notes and sections on the canvas: a section framing two nodes, plus a Markdown note.
 *  `fitView` frames the NODES only, so the section hugs them (a frame hanging far outside the
 *  nodes' bounds is clipped by the pane) and the note sits just below, inside the taller pane. */
export const WithNotesAndSections: Story = {
  args: {
    height: 640,
    value: {
      ...SAMPLE_WORKFLOW,
      canvas: {
        sections: [
          {
            id: "sec_delivery",
            title: "Delivery",
            color: "#6366f1",
            position: { x: 16, y: -24 },
            size: { width: 720, height: 150 },
            nodes: ["send", "notify"],
          },
        ],
        notes: [
          {
            id: "note_1",
            color: "#facc15",
            position: { x: 40, y: 170 },
            size: { width: 260, height: 90 },
            content: "**Heads up:** the email is sent before Slack is notified.",
          },
        ],
      },
    },
  },
};

/** A live run's per-step state, including a failed step. */
export const WithRunState: Story = {
  args: { runState: SAMPLE_RUN_STATE },
};

/** A step whose bound connection no longer exists, as the host reports it. */
export const WithMissingConnection: Story = {
  args: { stepProblems: { send: { code: "unknown_connection", connection: "conn_deleted" } } },
};

/** A run panel docking beside the canvas, as studio's run log does: the toggle
 *  narrows the editor's pane by 360px and changes `fitViewKey`, so the graph
 *  re-frames into the narrower pane instead of sliding behind the panel. */
function DockedRunPanelDemo(
  props: Omit<WorkflowFlowEditorProps, "value" | "onChange" | "height" | "fitViewKey"> & {
    value: FlowWorkflow;
  },
) {
  const [value, setValue] = useState(props.value);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Toggle run panel
      </button>
      <div style={{ display: "flex", width: 1000, height: 480 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorkflowFlowEditor
            {...props}
            value={value}
            onChange={setValue}
            height="100%"
            fitViewKey={open}
          />
        </div>
        {open && (
          <aside style={{ width: 360, flexShrink: 0, borderLeft: "1px solid var(--w6w-border)" }}>
            Run panel
          </aside>
        )}
      </div>
    </div>
  );
}

/** `fitViewKey`: toggling the docked panel re-frames the graph into the narrowed pane. */
export const DockedRunPanel: Story = {
  render: ({ height: _height, ...args }) => <DockedRunPanelDemo {...args} />,
};
