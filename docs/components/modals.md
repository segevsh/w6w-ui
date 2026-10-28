---
id: null
key: "components/modals"
title: "Modals"
section: "reference-packages"
description: "Open dialogs, confirm destructive actions, connect an app, and build a workflow node with @w6w/ui's modals."
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
[`W6WUIProvider`](/reference-packages/components/providers/).

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

There's another delete example on [Buttons and icons](/reference-packages/components/buttons/).

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

**Credential step.** An auth that declares `serviceAccount` (a credential shared by many
connections, such as a Google service account) gets a Credential step between the auth method and
its fields, when your client has both `listCredentials` and `createCredential`:

- **Use existing** lists the stored active credentials of the auth's contract and creates the
  connection with `{ authKey, credentialId, binding?, displayName? }`. It is the default when at
  least one exists.
- **Create new** asks for a credential name and the auth's fields, stores the credential, then
  creates the connection from it. If the connection call fails, the stored credential is kept and
  Save again attaches it instead of storing a second copy.
- Binding fields come from the auth's declaration. An **Impersonated user** input (the person the
  credential acts as) appears when the auth allows impersonation and is required when it demands
  it. The auth's scopes are shown read-only.

With either method missing, or for any auth that is not `serviceAccount`, nothing changes: the form
is the plain one and the body is `{ authKey, credential, displayName? }`.

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

Build one workflow node. The author picks what the node calls (a connected app's action, a
Function, a Workflow, or a built-in node such as a trigger, an `if` or a `foreach`), chooses a connection,
fills in the parameters, sets retry and error handling, and tests it. It's what
[`WorkflowFlowEditor`](/reference-packages/components/flow-editor/) opens to add a node, and you can open it
anywhere you need a node or a target.

| Prop | Type | What it does |
| --- | --- | --- |
| `onClose` | `() => void` | Required. |
| `onAdd` | `(step: BuiltStep) => string \| void` | Required. Fired when the node is first complete. Return the id you gave it to receive later edits through `onDraftChange`. |
| `onDraftChange` | `(id, step) => void` | Every edit after `onAdd`. Without it, the builder adds the node once, when the author finishes. |
| `title` | `string` | Heading. Defaults to `"Add a node"`. |
| `appsOnly` | `boolean` | Hide the workflow-only tabs (Triggers, Controls, Utilities, Data). For pickers that choose a target rather than add a canvas node. |
| `callables` | `("function" \| "workflow")[]` | Which of the Functions and Workflows tabs to show. Defaults to both. |
| `initialTab` | `"connected" \| "functions" \| "workflows"` | The tab that opens first. Defaults to `"connected"`. |
| `appsFilter` | `(app) => boolean` | Limit which apps can be picked. Applied in the browser, on the page as loaded — when it hides cards, the picker's footer drops its total and reports the card count alone. |
| `appsIds` | `string[]` | Limit which apps can be picked, on the SERVER (`GET /apps?ids=…`), so the paged footer reads `N of N`. Preferred over `appsFilter` whenever the allowed ids are known up front (a repo source, a model-provider set). |
| `initialApp`, `initialAction`, `initialConnection`, `initialWith` | | Open on an existing node's settings, for editing. |
| `connectionOnly` | `boolean` | Stop once a connection is chosen, with no action or test. Pair it with `onConnected(connectionId, app)`. |
| `workflowId`, `stepId` | `string` | The node's place in a saved workflow, so a previously saved passing test counts. |
| `upstreamSteps` | `{ id, label? }[]` | Earlier nodes, so `nodes.<id>.output` references resolve in a test. The older `steps.<id>.output` spelling still works. |
| `theme` | `"light" \| "dark"` | |

With a `workflowId`, the Triggers tab also lists app triggers. A webhook trigger is added with one
click. A poll trigger first asks "Check every … minutes" (default 5, or the trigger's
`minIntervalMs` if higher) and creates the subscription with that interval sent as `intervalMs`, in
milliseconds. The host enforces its own minimum and the picker shows its refusal as-is.

`BuiltStep` is a node without its id: `{ uses: { app, action, connection? }, with?, retry?,
onError?, notes? }`.

```tsx
import { StepBuilderModal, type BuiltStep } from "@w6w/ui";

{building && (
  <StepBuilderModal
    onClose={() => setBuilding(false)}
    onAdd={(step: BuiltStep) => {
      const id = `step_${workflow.nodes.length + 1}`;
      setWorkflow({ ...workflow, nodes: [...workflow.nodes, { id, ...step }] });
      setBuilding(false);
    }}
  />
)}
```

By default, an app node can't be added until a test of it passes. That gate is what
`isTestRequired(surface)` reports: it's `true` unless the app or node says `testRequired: false`.
`requiredParamsFilled(params, values)` is the other check the builder runs: whether every visible
required parameter has a value. Both are exported for your own forms.

## Where to next

- **[Forms](/reference-packages/components/forms/)**: the pieces the builder is made of, for building your own.
- **[Workflow canvas](/reference-packages/components/flow-editor/)**: where the builder usually opens from.
