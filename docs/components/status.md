---
id: null
key: "components/status"
title: "Status and health"
section: "reference-packages"
description: "Show API health, run and step status, daily uptime, incident history and repository sync state with @w6w/ui's status components."
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

# Status and health

Small indicators for whether something works. All five are props-only and render a state you've
already decided: none of them computes health or uptime. Every state shows a text label as well as
a color. The health colors come from the `--w6w-health-*` [tokens](/reference-packages/theming/); the step and run
pill uses `--w6w-accent`, `--w6w-success`, `--w6w-danger` and `--w6w-muted`.

## `HealthStatusPill`

A colored dot and a label for an API's or a connection's health.

| Prop | Type | What it does |
| --- | --- | --- |
| `state` | `"ok" \| "degraded" \| "down" \| "unknown"` | Required. Default labels: Operational, Degraded, Down, Unknown. |
| `label` | `ReactNode` | Replaces the default label. |
| `ariaLabel` | `string` | Accessible name. Defaults to the visible text. |

```tsx
import { HealthStatusPill } from "@w6w/ui";

<HealthStatusPill state="degraded" label="Degraded: elevated latency" />
```

## `StepStatusPill`

The same pill for the status of a run, an execution or a single step.

| Prop | Type | What it does |
| --- | --- | --- |
| `state` | `StepStatus \| ExecutionStatus` | Required. Step: `pending`, `running`, `succeeded`, `failed`, `skipped`. Execution: `queued`, `running`, `succeeded`, `failed`, `canceled`. The label is the capitalized state. |
| `label`, `ariaLabel` | | As on `HealthStatusPill`. |

```tsx
import { StepStatusPill } from "@w6w/ui";

<StepStatusPill state={run.status} />
```

## `UptimeStrip`

One cell per day, oldest first, the way a status page shows uptime. Hovering a cell shows its day
and state. Screen readers get the strip as one labelled image.

| Prop | Type | What it does |
| --- | --- | --- |
| `days` | `{ day, state, label? }[]` | Required. `day` is shown as-is (such as `2026-10-01`), `state` is one of the four health states, and `label` overrides the tooltip. Pass as many days as you have. |
| `ariaLabel` | `string` | Defaults to `<n>-day status`. |

```tsx
import { UptimeStrip } from "@w6w/ui";

<UptimeStrip
  days={[
    { day: "2026-10-04", state: "ok" },
    { day: "2026-10-05", state: "degraded", label: "2026-10-05: 3 failed calls" },
    { day: "2026-10-06", state: "ok" },
  ]}
/>
```

## `HistoryTimeline`

Two lanes over the same calendar window: your own calls, day by day, and the vendor's published
incidents. Use it to see whether a bad day was yours or theirs.

| Prop | Type | What it does |
| --- | --- | --- |
| `window` | `{ from, to }` | Required. Inclusive `YYYY-MM-DD` bounds. |
| `days` | `UptimeDay[]` | Required. Your lane, as for `UptimeStrip`. |
| `incidents` | `{ title, state, startedAt?, resolvedAt?, updatedAt?, components?, link?, id? }[]` | The vendor lane. Leave it `undefined` when the vendor publishes no incident history, and pass `[]` for a quiet window: they show different messages. An incident with `startedAt` and no `resolvedAt` is still open. |
| `vendorEmptyLabel` | `string` | Replaces the vendor lane's empty-state text. |
| `nowMs` | `number` | The right edge of an open incident. Defaults to now. |
| `ariaLabel` | `string` | |

```tsx
import { HistoryTimeline } from "@w6w/ui";

<HistoryTimeline
  window={{ from: "2026-09-07", to: "2026-10-06" }}
  days={dailyHealth}
  incidents={[
    {
      title: "Elevated API error rates",
      state: "degraded",
      startedAt: "2026-10-05T14:02:00Z",
      resolvedAt: "2026-10-05T15:40:00Z",
      link: "https://status.example.com/incidents/123",
    },
  ]}
/>
```

## `RepoSyncIndicator`

A compact header control for a project synced from a Git repository: the branch and short commit,
with a menu showing the last sync and a **Sync now** item. Esc and an outside click close the menu.

| Prop | Type | What it does |
| --- | --- | --- |
| `branch` | `string` | Required. Such as `"main"`. |
| `shortSha` | `string \| null` | Required. Already shortened. `null` hides it. |
| `lastSyncLabel` | `string \| null` | Required. Already formatted, such as `"Never synced"`. `null` hides the row. |
| `onSyncNow` | `() => void` | Required. Start the sync yourself. |
| `syncing` | `boolean` | Shows that a sync is in flight. |
| `className`, `data-testid` | `string` | Passed through. |

```tsx
import { RepoSyncIndicator } from "@w6w/ui";

<RepoSyncIndicator
  branch="main"
  shortSha={sync.sha?.slice(0, 7) ?? null}
  lastSyncLabel={sync.at ? new Date(sync.at).toLocaleString() : "Never synced"}
  onSyncNow={() => startSync()}
  syncing={sync.inFlight}
/>
```

## Where to next

- **[Executions](/reference-packages/components/executions/)**: lists and details of past runs.
- **[Data display](/reference-packages/components/data-display/)**: `ListItem`, with a slot for a pill.
