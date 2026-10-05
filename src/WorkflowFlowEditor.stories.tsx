// Per the `flow.ts` consumer contract, a caller of `WorkflowFlowEditor`
// imports React Flow's stylesheet itself — so this story does too, rather
// than relying on `.storybook/preview.tsx` to supply it for every story.
import "@xyflow/react/dist/style.css";
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
  steps: [
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
  steps: [],
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

/** No steps at all — the canvas's empty state. */
export const Empty: Story = {
  args: { value: EMPTY_WORKFLOW },
};

/** Pans/zooms stay enabled; every other interaction is disabled. */
export const ReadOnly: Story = {
  args: { readOnly: true },
};

/** A live run's per-step state, including a failed step. */
export const WithRunState: Story = {
  args: { runState: SAMPLE_RUN_STATE },
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
