---
id: null
key: "components/modals"
title: "Modals"
section: "ui"
description: "Open dialogs, confirm destructive actions, connect an app, and build a workflow step with @w6w/ui's modals."
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

# Modals

Two general dialogs, `Modal` and `ConfirmModal`, and two complete flows built on them:
`AddConnectionModal` and `StepBuilderModal`. The two flows call your server through
[`W6WUIProvider`](/ui/components/providers/).

Every modal here is a native `<dialog>`, so focus stays inside it and Esc closes it. Render a modal
when you want it open and stop rendering it to close it. There's no `open` prop.

## `Modal`

A titled dialog for your own content. Esc and a click outside it both call `onClose`.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `title` | `ReactNode` | Required | Title row. A string also names the dialog for screen readers. |
| `onClose` | `() => void` | Required | Esc, outside click. |
| `children` | `ReactNode` | Required | The body. |
| `size` | `"default" \| "wide" \| "xl" \| "full" \| "fullscreen"` | `"default"` | `wide` fits a sidebar and content, `xl` a large work surface, `full` most of the viewport, `fullscreen` the whole viewport. |
| `ariaLabel` | `string` | `title` | Accessible name, when `title` isn't a plain string. |
| `titleIcon` | `ReactNode` | None | Next to the title, such as an `AppIcon`. |
| `subtitle` | `ReactNode` | None | Muted text after the title. |
| `headerRight` | `ReactNode` | None | Far right of the title row, such as a back or close button. |

A `fullscreen` modal has no backdrop to click, so put a visible close control in `headerRight`.

```tsx
import { AppIcon, Modal } from "@w6w/ui";

{open && (
  <Modal
    title="Slack"
    titleIcon={<AppIcon name="Slack" size={20} />}
    subtitle="slack · v1.4.0"
    size="wide"
    onClose={() => setOpen(false)}
  >
    <AppDetails appId="slack" />
  </Modal>
)}
```

## `ConfirmModal`

A yes/no dialog for a dangerous action, instead of the browser's `confirm()`.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `title`, `message` | `string` | Required | The question and its consequence. |
| `onConfirm` | `() => void` | Required | The confirm button. It doesn't close the dialog: clear your pending state there too. |
| `onClose` | `() => void` | Required | Cancel, Esc or outside click. |
| `confirmLabel`, `cancelLabel` | `string` | `"Confirm"`, `"Cancel"` | Button text. |
| `destructive` | `boolean` | `true` | Danger-styles the confirm button. |
| `children` | `ReactNode` | None | Extra lines under the message, such as a warning. |

Render it next to another open modal, not inside its body.

```tsx
import { ConfirmModal } from "@w6w/ui";

{pendingDelete && (
  <ConfirmModal
    title="Delete workflow?"
    message={`"${pendingDelete.name}" and its run history will be removed.`}
    confirmLabel="Delete"
    onConfirm={() => {
      deleteWorkflow(pendingDelete.id);
      setPendingDelete(null);
    }}
    onClose={() => setPendingDelete(null)}
  />
)}
```

There's another delete example on [Buttons and icons](/ui/components/buttons/).

## `AddConnectionModal` (provider)

The full connect-an-app flow: pick an app, pick its auth method, then fill in the credential fields
or complete OAuth in a popup.

| Prop | Type | What it does |
| --- | --- | --- |
| `onClose` | `() => void` | Required. |
| `onCreated` | `({ connectionId }) => void` | Required. Fired once the connection exists. Close the modal and refresh your list here. |
| `initialAppId` | `string` | Skip the picker and open on this app. |
| `theme` | `"light" \| "dark"` | |

It reads everything else from your client: `listAppsPage` (or `listApps`), `getAppAuth`,
`createConnection` and `startAppOAuthFlow`. The picker shows category chips.

```tsx
import { AddConnectionModal } from "@w6w/ui";

{adding && (
  <AddConnectionModal
    onClose={() => setAdding(false)}
    onCreated={({ connectionId }) => {
      setAdding(false);
      refreshConnections(connectionId);
    }}
  />
)}
```

For OAuth apps, allow popups from your site: the flow opens the vendor's consent page in one, and
fails with a message if the browser blocks it.

## `StepBuilderModal` (provider)

Build one workflow step. The author picks what the step calls (a connected app's action, a
Function, a Workflow, or a built-in node such as a trigger, an `if` or a `foreach`), chooses a connection,
fills in the parameters, sets retry and error handling, and tests it. It's what
[`WorkflowFlowEditor`](/ui/components/flow-editor/) opens to add a step, and you can open it
anywhere you need a step or a target.

| Prop | Type | What it does |
| --- | --- | --- |
| `onClose` | `() => void` | Required. |
| `onAdd` | `(step: BuiltStep) => string \| void` | Required. Fired when the step is first complete. Return the id you gave it to receive later edits through `onDraftChange`. |
| `onDraftChange` | `(id, step) => void` | Every edit after `onAdd`. Without it, the builder adds the step once, when the author finishes. |
| `title` | `string` | Heading. Defaults to `"Add a step"`. |
| `appsOnly` | `boolean` | Hide the workflow-only tabs (Triggers, Controls, Utilities, Data). For pickers that choose a target rather than add a canvas node. |
| `callables` | `("function" \| "workflow")[]` | Which of the Functions and Workflows tabs to show. Defaults to both. |
| `initialTab` | `"connected" \| "functions" \| "workflows"` | The tab that opens first. Defaults to `"connected"`. |
| `appsFilter` | `(app) => boolean` | Limit which apps can be picked. |
| `initialApp`, `initialAction`, `initialConnection`, `initialWith` | | Open on an existing step's settings, for editing. |
| `connectionOnly` | `boolean` | Stop once a connection is chosen, with no action or test. Pair it with `onConnected(connectionId, app)`. |
| `workflowId`, `stepId` | `string` | The step's place in a saved workflow, so a previously saved passing test counts. |
| `upstreamSteps` | `{ id, label? }[]` | Earlier steps, so `steps.<id>.output` references resolve in a test. |
| `theme` | `"light" \| "dark"` | |

`BuiltStep` is a step without its id: `{ uses: { app, action, connection? }, with?, retry?,
onError?, notes? }`.

```tsx
import { StepBuilderModal, type BuiltStep } from "@w6w/ui";

{building && (
  <StepBuilderModal
    onClose={() => setBuilding(false)}
    onAdd={(step: BuiltStep) => {
      const id = `step_${workflow.steps.length + 1}`;
      setWorkflow({ ...workflow, steps: [...workflow.steps, { id, ...step }] });
      setBuilding(false);
    }}
  />
)}
```

By default, an app step can't be added until a test of it passes. That gate is what
`isTestRequired(surface)` reports: it's `true` unless the app or node says `testRequired: false`.
`requiredParamsFilled(params, values)` is the other check the builder runs: whether every visible
required parameter has a value. Both are exported for your own forms.

## Where to next

- **[Forms](/ui/components/forms/)**: the pieces the builder is made of, for building your own.
- **[Workflow canvas](/ui/components/flow-editor/)**: where the builder usually opens from.
