---
id: null
key: "components/executions"
title: "Executions"
section: "ui"
description: "Build an execution history view (list, filters, totals, detail, step log and vendor API calls) from @w6w/ui's execution components."
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

# Executions

The pieces of a run-history view: a filter bar, a totals strip, a paged list and a detail panel
with the step log and the vendor calls each step made. All six are props-only. Fetch the runs with
`@w6w/react` or your own client and pass them in. Filtering, paging and polling are yours to decide.

An execution here is one run of a Function, an Endpoint or a Workflow, with a `kind` of
`"function"`, `"endpoint"` or `"workflow"`. Its `status` is `queued`, `running`, `succeeded`,
`failed` or `canceled`. Times are ISO-8601 strings, and an unknown duration or time renders as `—`,
never as `0`.

## Put them together

```tsx
import {
  ExecutionDetail,
  ExecutionFilters,
  ExecutionList,
  ExecutionStats,
  type ExecutionFilterValue,
} from "@w6w/ui";

const [filters, setFilters] = useState<ExecutionFilterValue>({
  status: "",
  kind: "",
  from: "",
  to: "",
  q: "",
});
const [selectedId, setSelectedId] = useState<string | null>(null);

<ExecutionFilters value={filters} onChange={setFilters} showKind />
<ExecutionStats stats={stats} label="Last 7 days" />
<ExecutionList
  items={page.items}
  showCallable
  selectedId={selectedId}
  onSelect={setSelectedId}
  hasPrev={page.hasPrev}
  hasNext={page.hasNext}
  onPrev={prevPage}
  onNext={nextPage}
/>
{selectedId && (
  <ExecutionDetail
    execution={detail}
    loading={detailLoading}
    onClose={() => setSelectedId(null)}
  />
)}
```

## `ExecutionList`

A paged list of runs, in the order you give.

| Prop | Type | What it does |
| --- | --- | --- |
| `items` | `{ id, kind, callableName, status, startedAt, durationMs }[]` | Required. `durationMs` is `null` while a run is unfinished. |
| `showCallable` | `boolean` | `true` titles each row with the callable's name, for a project-wide history. The default, `false`, titles it with the start time, for one callable's history. |
| `selectedId` | `string \| null` | The row to highlight. |
| `onSelect` | `(id) => void` | Makes rows clickable. |
| `loading` | `boolean` | Shows the loading state while there are no items yet. |
| `emptyLabel` | `ReactNode` | Shown when `items` is empty. |
| `hasPrev`, `hasNext`, `onPrev`, `onNext` | | The pager. It renders once you pass `onPrev` or `onNext`. |

## `ExecutionFilters`

Status, an optional kind, a date range and a search box, with a **Clear** button.

| Prop | Type | What it does |
| --- | --- | --- |
| `value` | `{ status, kind, from, to, q }` | Required. `""` means "any" for each field. `from` and `to` are inclusive `YYYY-MM-DD` dates. |
| `onChange` | `(next) => void` | Required. Fired once per change, with no debounce: debounce `q` yourself if you query as the user types. |
| `showKind` | `boolean` | Show the kind select. Defaults to `false`. |
| `searchPlaceholder` | `string` | Defaults to `"Search by id or name"`. |
| `disabled` | `boolean` | Disable every control, such as while a request is in flight. |

Keep the filters in your URL so they survive a reload: the component holds no state of its own.

## `ExecutionStats`

A row of totals for the current filter.

| Prop | Type | What it does |
| --- | --- | --- |
| `stats` | `{ total, succeeded, failed, canceled, inFlight, successRate, avgDurationMs } \| null` | `null` while loading (each card shows `—`). `successRate` is `0` to `1`, or `null` when there were no runs. `avgDurationMs` covers finished runs only. An **In flight** card appears only while `inFlight > 0`. |
| `label` | `ReactNode` | A caption, such as `"Last 7 days"`. |

## `ExecutionDetail`

One run: its status, timing, input, output, error and, for a workflow, the step log.

| Prop | Type | What it does |
| --- | --- | --- |
| `execution` | `ExecutionDetailValue \| null` | The run, or `null` while there's nothing to show. Fields: `id`, `kind`, `callableName`, `status`, `startedAt`, `finishedAt`, `durationMs`, and optionally `input`, `output`, `error` and `steps`. |
| `loading` | `boolean` | Loading state for a `null` `execution`. Once a run is shown, re-fetching keeps showing it. |
| `errorMessage` | `ReactNode` | An alert, such as "Couldn't load this run". |
| `onClose` | `() => void` | Adds a close control. |
| `onOpenInEditor` | `() => void` | Adds an **Open in visual editor** button. Pass it for workflow runs only. |

Leave `input` or `output` `undefined` to hide that section. Pass `null` to show a `null` value.
`steps` follows the same rule.

## `ExecutionLogPanel`

The step-by-step log of a workflow run. `ExecutionDetail` renders it for you; use it on its own
beside the [workflow canvas](/ui/components/flow-editor/).

| Prop | Type | What it does |
| --- | --- | --- |
| `steps` | `{ id, label?, status, startedAt?, finishedAt?, input?, output?, error? }[]` | Required. In run order. `status` is a step status (`pending`, `running`, `succeeded`, `failed` or `skipped`). |
| `runError` | `{ message, code?, phase?, retryable? }` | Why the run itself failed, shown above the steps. |
| `stepErrors` | `{ stepId, label?, error }[]` | Failures the run recorded and continued past (a step with `onError: "continue-record"`). |
| `emptyLabel` | `ReactNode` | Shown when `steps` is empty. |
| `onDismiss` | `() => void` | Adds a header row with a dismiss control. |

```tsx
import { ExecutionLogPanel } from "@w6w/ui";

<ExecutionLogPanel
  steps={[
    { id: "trigger", status: "succeeded" },
    { id: "send", label: "Send email", status: "failed", error: { code: "http_401", message: "Unauthorized" } },
    { id: "notify", status: "skipped" },
  ]}
  onDismiss={() => setShowLog(false)}
/>
```

## `ApiCallsPanel`

The raw HTTP calls a run or an action test made to the vendor: method, host, status, timing, and
the request and response headers and bodies, each call in a collapsible row. Use it to see exactly
what the vendor was sent and what it answered.

| Prop | Type | What it does |
| --- | --- | --- |
| `calls` | `ApiCallRecord[]` | Required. In the order made. Renders nothing when empty. |
| `defaultOpen` | `boolean` | Open every call on first render. Defaults to `false`. |
| `title` | `ReactNode \| false` | Defaults to `API call(s) (N)`. `false` hides it when you supply your own heading. |
| `keyOf` | `(call, index) => string` | A React key per call. Pass one when you page through stored calls, so open rows don't jump between pages. |

Each `ApiCallRecord` has `host`, `method` and `status` (`0` when no response came back, with
`error` saying why), and optionally `url`, `requestHeaders`, `requestBody`, `responseHeaders`,
`responseBody`, `responseBytes`, `durationMs` and `truncated` (the body hit the capture size limit).
The W6W server redacts credentials in the request and response headers when it captures a call.
The panel shows whatever you pass as-is, so redact any records you build yourself.

```tsx
import { ApiCallsPanel } from "@w6w/ui";

<ApiCallsPanel calls={result.apiCalls ?? []} />
```

## Formatters

Two helpers format values the way these components do:

- **`formatDurationMs(ms)`** gives `999 ms`, `1.5 s` or `2m 5s`, and `—` for `null`, negative or
  non-numeric input.
- **`formatExecutionTime(iso)`** gives a short date and time in the viewer's locale, such as
  `Sep 22, 2026, 10:00 AM`. A string it can't parse comes back unchanged.

## Where to next

- **[Status and health](/ui/components/status/)**: `StepStatusPill`, the badge these components use.
- **[Workflow canvas](/ui/components/flow-editor/)**: paint a run onto the workflow itself.
