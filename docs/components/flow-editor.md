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

`WorkflowFlowEditor` is a drag-and-drop canvas for one workflow: nodes as cards, edges between them,
and editing, testing, duplicating and deleting a node from its card. New nodes come from the
[node builder](/reference-packages/components/modals/#stepbuildermodal-provider).

It lives in its own entrypoint, `@w6w/ui/flow`, so apps that don't use it don't bundle React Flow
(`@xyflow/react`, installed with `@w6w/ui`). It calls your server through
[`W6WUIProvider`](/reference-packages/components/providers/) to list connections and run node tests.

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
| `onChange` | `(next: FlowWorkflow) => void` | Required | Every graph or node edit. |
| `readOnly` | `boolean` | `false` | No edits. Pan and zoom still work. |
| `height` | `string \| number` | `480px` | Viewport height. |
| `apps` | `AppSummary[]` | None | Lets each card show its app's icon, name and version. Unknown apps get an initials tile. |
| `exprOptions` | `ExpressionOptions` | None | Extra scope for the expression pickers, on top of any `ExpressionOptionsProvider` above. |
| `project` | `string` | None | Project id for node tests, so `documents.*` references resolve against that project. |
| `runState` | `{ status, steps }` | None | A run to paint on the canvas. See below. |
| `onTestRun` | `() => void` | None | Fired as a node test starts, so you can clear a stale `runState`. |
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
  nodes: [
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

- **`nodes[]`**: `id`, `uses: { app, action, connection? }`, and optionally `with`, `retry`,
  `onError` and `notes`. The settings are the ones in
  [`NodeConfigForm`](/reference-packages/components/forms/#nodeconfigform). A workflow read in the
  older `steps[]` shape is still accepted; carrying both keys is refused.
- **`edges[]`**: `{ from, to, when? }`, where `when` is `"success"` or `"error"`. Leave `edges` out
  and the nodes run in order, one after another.
- **`ports`** (optional, on a node): `{ in?, out? }`, how many edges may enter and leave the node.
  A count is a number, or `"many"` for no limit.
- **`fanOut`** (optional, on a node): `"parallel"` runs a node's next nodes at the same time. Leave it
  out and they run one after another. Only `"parallel"` is ever written; `"sequential"` is the
  absence of the key.
- **`canvas`** (optional): notes and sections drawn around the graph. The engine ignores it. See
  [Notes and sections](#notes-and-sections).

## Notes and sections

Beside its nodes a workflow can carry canvas furniture: **notes** for prose, and **sections** that
frame a group of nodes. Both live under the workflow's `canvas` key, which the engine ignores — it is
layout, not behaviour.

```ts
const workflow: FlowWorkflow = {
  // …nodes and edges…
  canvas: {
    notes: [
      {
        id: "note_1",
        color: "#facc15",
        position: { x: 40, y: 40 },
        size: { width: 200, height: 120 },
        content: "Retries here are **deliberate** — see the runbook.",
      },
    ],
    sections: [
      {
        id: "section_1",
        title: "Notification fan-out",
        color: "#6366f1",
        position: { x: 320, y: 20 },
        size: { width: 420, height: 260 },
        nodes: ["send", "notify"],
      },
    ],
  },
};
```

- **`notes[]`**: `id`, `color`, `position`, `size` and `content`, the note's Markdown.
- **`sections[]`**: `id`, `title` (plain text, not Markdown), `color`, `position`, `size` and
  `nodes[]`, the ids of the nodes the section frames. A node belongs to at most one section, and a
  section never contains another section.
- **Color** is always `#rrggbb`.
- **Caps**: 200 notes, 200 sections, and 10 KB of Markdown per note. The editor clamps to them rather
  than refusing the edit.
- Ids share no namespace with node ids, so a note may be called `send` without colliding.

### Making them on the canvas

Two icon buttons sit in the editor toolbar beside **+ Node**: **Add note** (the sticky-note icon)
and **Draw section** (the frame icon).

**Draw section** is a tool, not an action on the selection: press it, then drag a rectangle anywhere
on the canvas. The frame you draw becomes the section, and every node whose center falls inside it
becomes a member. A click without a drag drops a 360×240 frame at that point. The tool disarms after
one frame; Esc, or pressing the button again, cancels it.

A note is edited in place. Click it to select it, drag its body to move it, and double-click it to
type straight into it — there is no separate text box. Clicking away writes the note back as
Markdown. Selecting a note opens a toolbar that floats above it, at a constant screen size at any
zoom:

- a **grip** that moves the note, which also works while you are typing in it
- **Color**, a palette of note colors plus a custom picker
- **Text size** (**Title**, **Heading**, **Subheading**, **Body**), which writes `#`, `##`, `###`
  or no prefix on the lines it covers
- **Bold**, which writes `**…**` around the selected text
- **Delete**

A format applies to the selected text while you are typing, or to the whole note when you are not.
Each format is written to the note's Markdown as soon as it is applied. Pasted text arrives as plain
text. Drag a note's corner to resize it.

A section keeps nothing inside its frame except the resize corner. Its label sits just above the
frame's top-left corner; drag the label to move the section, or click it to select the section.
Selecting a section swaps the label for a toolbar in the same spot, at a constant screen size:

- a **grip** that moves the section
- the **label**, as a text field: type into it and press Enter (or click away) to rename the section
- **Color**, the same palette as notes plus a custom picker
- **Delete**, which asks first, in a modal; deleting a section removes the frame and keeps every
  node in it

Dragging a section carries its member nodes along by the same offset, and emits one `onChange` on
drop rather than one per animation frame. Drag a node until its center sits inside a section and it
joins that section, leaving whichever section it was in before; drag it out and it leaves. Deleting
a node drops it from its section, and renaming a node remaps the section to the new id, so a section
never points at a node that is gone.

### What a note renders

Note content is Markdown, kept to a deliberately small subset because it was written by whoever
authored the workflow — not necessarily by whoever is reading it:

- **Headings, bold, italic, lists, quotes, code blocks, tables and links** render.
- **No raw HTML.** A typed `<div>` or `<script>` tag is dropped rather than rendered.
- **No images.** `![alt](url)` renders nothing; there is no image support on the canvas.
- **Links only to `http:`, `https:` and `mailto:`.** Any other scheme — `javascript:`, `data:`, or a
  relative path — renders as link text with no `href` at all. Permitted links open in a new tab.

`Markdown` is exported from `@w6w/ui/flow` (and `@w6w/ui`) with those rules already applied, for
when you render note content somewhere else.

### Where they sit

The drawing order is background, sections, notes, edges, then nodes. Notes and sections are drawn
below the graph, so selecting or dragging one never lifts it over an edge or a node. A click that
passes through the empty part of a section still reaches the canvas and clears the selection.

`readOnly` hides **Add note**, **Draw section** and both toolbars, leaving a section's label as plain
text, and turns off dragging and editing. Panning and zooming still work.

### Notes when `savePosition` is off

With `settings.savePosition: false` a note or section still moves and resizes live on the canvas,
but the position and size that persist are the stored ones — the same rule node positions follow.
A note or section created in that session keeps the geometry it was given, because there is no
stored value to hold it at.

## Add a step from a port

Drag a connection out of any port on a node and let go on empty canvas: the node builder opens,
and the step you pick is placed where you let go and connected to that port. The left port is the
entry, the right port is the exit, and the red port underneath is the error exit. From the exit
the new step comes next; from the entry it comes before this node; from the error exit it runs on
the `error` lane. A plain click on a port does the same, placing the step beside that side of the
node. It goes in by the same rules as an edge you draw by hand, which are set out below. With
`readOnly`, ports do nothing.

## How many edges a node can have

The canvas works out each node's `in` and `out` one field at a time. For each field it takes the
first value declared, in this order:

1. the node's own `ports`;
2. the action's `ports` in the app catalog (an app's defaults are already folded into its actions);
3. the built-in definition for the control and trigger nodes;
4. the default: `in: 1`, `out: "many"`.

So a node with `ports: { in: 0 }` on an action that declares `{ out: 2 }` gets `in: 0` and `out: 2`.
`"many"` at any level means no limit. Catalog ports are only read to draw the canvas; they are
never copied onto the node, so a saved workflow has a `ports` key only where you wrote one.

A node with `out` above 1 draws a tall, multi-connection handle. Drawing an edge from a node that
already has as many as its finite `out` allows in that lane (`success` and `error` are counted
separately) is refused: no existing edge is removed, and the editor shows a message naming the cap.
Switching an edge to the other lane is refused the same way. A node with `"many"` never refuses.

## Merge several branches into one node

The **Merge** control node (`@w6w/control`, action `merge`) joins parallel branches. Its built-in
definition declares `in: "many"`, so any number of edges may enter it, and `out: 1`. Its params are:

- **`mode`**: `array` or `object`, the shape of the merged result.
- **`entries`**: a list of `{ key, value }` rows. `key` is a plain string; `value` is a field with
  the expression (ƒx) toggle, so it can reference the output of any upstream node. A merge with
  inbound edges from A and B offers both A and B in the ƒx node list.

The builder's control list shows **Merge**. The older **Aggregate** node is hidden from the palette
(`hidden: true` on its definition in `INTERNAL_NODES`) but is not removed: a workflow that already
uses it still renders and edits, and `internalNodeDef("@w6w/control", "aggregate")` still resolves.

## Run next nodes in parallel

When a node has two or more edges leaving it in one lane, its settings show a **Run next nodes**
control: **In sequence** (the default) or **In parallel**. Below two edges the control is disabled
and says why. Choosing **In parallel** writes `fanOut: "parallel"` on the node; choosing **In
sequence** removes the key.

The same node's card carries a small badge, in edit and read-only mode alike, once it has two or
more edges in a lane. The glyph shows the mode (`⇉` parallel, `→` sequence), followed by the count.
Its label reads `Runs these N nodes in parallel` or `Runs these N nodes in sequence`, where N is
the largest number of edges leaving the node in either lane.

## Show a run on the canvas

The canvas doesn't fetch runs. Poll the run yourself (`GET /runs/:id`) and pass each result as
`runState`: each node's card shows its status, and the edges show which way the run went.

```tsx
<WorkflowFlowEditor
  value={workflow}
  onChange={setWorkflow}
  runState={{ status: "failed", steps: { trigger: { status: "succeeded" }, send: { status: "failed" } } }}
  onTestRun={() => setRunState(undefined)}
/>
```

Run statuses are `queued`, `running`, `succeeded`, `failed` and `canceled`. Node statuses are
`pending`, `running`, `succeeded`, `failed` and `skipped`. A node missing from the run's `steps`
map hasn't been reached. `runState` is never written back into the workflow.

## Helpers

`@w6w/ui/flow` also exports what the canvas is built on, for when you render or inspect a workflow
yourself:

- **`workflowToFlow(workflow)`** and **`flowToWorkflow(original, nodes, edges)`**: convert between a
  workflow and React Flow nodes and edges, with the canvas's automatic layout.
- **Built-in app ids**: `TRIGGER_APP`, `WEBHOOK_APP`, `SCHEDULER_APP`, `CONTROL_APP`, `SCRIPT_APP`,
  `DATA_APP` and `CALL_APP`, with `isInternalApp(app)`, `isTriggerApp(app)` and
  `isControlApp(app)`.
- **`INTERNAL_NODES`**: the built-in nodes the builder offers (triggers, control flow, script,
  data and so on), with `internalNodeLabel`, `internalNodeIcon`, `internalNodeParams` and
  `internalNodeDefaults` to look one up by app and action.
- **`ExpressionOptionsProvider`**: re-exported here for convenience.

## Where to next

- **[Modals](/reference-packages/components/modals/)**: the node builder the canvas opens.
- **[Executions](/reference-packages/components/executions/)**: list and inspect past runs beside the canvas.
