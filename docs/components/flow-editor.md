---
id: null
key: "components/flow-editor"
title: "Workflow canvas"
section: "reference-packages"
description: "Embed WorkflowFlowEditor, the visual workflow canvas from @w6w/ui/flow, and show a run's progress on it."
format: "markdown"
shared: true
sourceRepo: null
sourcePath: null
sourceSha: null
sourceRefSha: null
sourceUrl: null
syncedAt: null
createdAt: null
updatedAt: null
---

# Workflow canvas

`WorkflowFlowEditor` is a drag-and-drop canvas for one workflow: steps as cards, edges between them,
and editing, testing, duplicating and deleting a step from its card. New steps come from the
[step builder](/reference-packages/components/modals/#stepbuildermodal-provider).

It lives in its own entrypoint, `@w6w/ui/flow`, so apps that don't use it don't bundle React Flow
(`@xyflow/react`, installed with `@w6w/ui`). It calls your server through
[`W6WUIProvider`](/reference-packages/components/providers/) to list connections and run step tests.

## Set it up

```tsx
import { W6WUIProvider, createW6WApi } from "@w6w/ui";
import { WorkflowFlowEditor, type FlowWorkflow } from "@w6w/ui/flow";
import "@w6w/ui/styles.css";
import { useState } from "react";

const api = createW6WApi({ baseUrl: "https://<your-host>", token: getToken });

function Editor({ initial }: { initial: FlowWorkflow }) {
  const [workflow, setWorkflow] = useState(initial);
  return (
    <W6WUIProvider api={api}>
      <WorkflowFlowEditor value={workflow} onChange={setWorkflow} height="70vh" />
    </W6WUIProvider>
  );
}
```

The editor imports React Flow's own stylesheet for you. You only load `@w6w/ui/styles.css`.

It's controlled and never saves on its own: persist `workflow` yourself, through `@w6w/react` or
your own client.

## Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `FlowWorkflow` | Required | The workflow. A new object identity re-derives the layout. |
| `onChange` | `(next: FlowWorkflow) => void` | Required | Every graph or step edit. |
| `readOnly` | `boolean` | `false` | No edits. Pan and zoom still work. |
| `height` | `string \| number` | `480px` | Viewport height. |
| `apps` | `AppSummary[]` | None | Lets each card show its app's icon, name and version. Unknown apps get an initials tile. |
| `exprOptions` | `ExpressionOptions` | None | Extra scope for the expression pickers, on top of any `ExpressionOptionsProvider` above. |
| `project` | `string` | None | Project id for step tests, so `documents.*` references resolve against that project. |
| `runState` | `{ status, steps }` | None | A run to paint on the canvas. See below. |
| `onTestRun` | `() => void` | None | Fired as a step test starts, so you can clear a stale `runState`. |
| `fitViewKey` | `string \| number \| boolean` | None | Change it to re-fit the view, for example when a side panel opens beside the canvas. |

## The workflow shape

`FlowWorkflow` is the subset of a W6W workflow the canvas edits. A workflow from the API fits it
as-is.

```ts
const workflow: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_demo",
  name: "onboarding",
  displayName: "Onboarding email",
  steps: [
    { id: "trigger", uses: { app: "@w6w/webhook", action: "receive" } },
    {
      id: "send",
      uses: { app: "sendgrid", action: "send-email", connection: "<connection-id>" },
      with: { to: "ada@example.com" },
    },
    { id: "notify", uses: { app: "slack", action: "post-message" } },
  ],
  edges: [
    { from: "trigger", to: "send" },
    { from: "send", to: "notify" },
  ],
};
```

- **`steps[]`**: `id`, `uses: { app, action, connection? }`, and optionally `with`, `retry`,
  `onError` and `notes`. The settings are the ones in
  [`NodeConfigForm`](/reference-packages/components/forms/#nodeconfigform).
- **`edges[]`**: `{ from, to, when? }`, where `when` is `"success"` or `"error"`. Leave `edges` out
  and the steps run in order, one after another.
- **`ports`** (optional, on a step): `{ in?, out? }`, how many edges may enter and leave the step.
  A count is a number, or `"many"` for no limit.
- **`fanOut`** (optional, on a step): `"parallel"` runs a step's next steps at the same time. Leave it
  out and they run one after another. Only `"parallel"` is ever written; `"sequential"` is the
  absence of the key.

## How many edges a step can have

The canvas works out each step's `in` and `out` one field at a time. For each field it takes the
first value declared, in this order:

1. the step's own `ports`;
2. the action's `ports` in the app catalog (an app's defaults are already folded into its actions);
3. the built-in definition for the control and trigger nodes;
4. the default: `in: 1`, `out: "many"`.

So a step with `ports: { in: 0 }` on an action that declares `{ out: 2 }` gets `in: 0` and `out: 2`.
`"many"` at any level means no limit. Catalog ports are only read to draw the canvas; they are
never copied onto the step, so a saved workflow has a `ports` key only where you wrote one.

A step with `out` above 1 draws a tall, multi-connection handle. Drawing an edge from a step that
already has as many as its finite `out` allows in that lane (`success` and `error` are counted
separately) is refused: no existing edge is removed, and the editor shows a message naming the cap.
Switching an edge to the other lane is refused the same way. A step with `"many"` never refuses.

## Run next steps in parallel

When a step has two or more edges leaving it in one lane, its settings show a **Run next steps**
control: **In sequence** (the default) or **In parallel**. Below two edges the control is disabled
and says why. Choosing **In parallel** writes `fanOut: "parallel"` on the step; choosing **In
sequence** removes the key.

The same step's card carries a small badge, in edit and read-only mode alike, once it has two or
more edges in a lane. The glyph shows the mode (`⇉` parallel, `→` sequence), followed by the count.
Its label reads `Runs these N steps in parallel` or `Runs these N steps in sequence`, where N is
the largest number of edges leaving the step in either lane.

## Show a run on the canvas

The canvas doesn't fetch runs. Poll the run yourself (`GET /runs/:id`) and pass each result as
`runState`: each step's card shows its status, and the edges show which way the run went.

```tsx
<WorkflowFlowEditor
  value={workflow}
  onChange={setWorkflow}
  runState={{ status: "failed", steps: { trigger: { status: "succeeded" }, send: { status: "failed" } } }}
  onTestRun={() => setRunState(undefined)}
/>
```

Run statuses are `queued`, `running`, `succeeded`, `failed` and `canceled`. Step statuses are
`pending`, `running`, `succeeded`, `failed` and `skipped`. A step missing from `steps` hasn't been
reached. `runState` is never written back into the workflow.

## Helpers

`@w6w/ui/flow` also exports what the canvas is built on, for when you render or inspect a workflow
yourself:

- **`workflowToFlow(workflow)`** and **`flowToWorkflow(original, nodes, edges)`**: convert between a
  workflow and React Flow nodes and edges, with the canvas's automatic layout.
- **Built-in app ids**: `TRIGGER_APP`, `WEBHOOK_APP`, `SCHEDULER_APP`, `CONTROL_APP`, `SCRIPT_APP`,
  `DATA_APP` and `CALL_APP`, with `isInternalApp(app)`, `isTriggerApp(app)` and
  `isControlApp(app)`.
- **`INTERNAL_NODES`**: the built-in steps the builder offers (triggers, control flow, script,
  data and so on), with `internalNodeLabel`, `internalNodeIcon`, `internalNodeParams` and
  `internalNodeDefaults` to look one up by app and action.
- **`ExpressionOptionsProvider`**: re-exported here for convenience.

## Where to next

- **[Modals](/reference-packages/components/modals/)**: the step builder the canvas opens.
- **[Executions](/reference-packages/components/executions/)**: list and inspect past runs beside the canvas.
