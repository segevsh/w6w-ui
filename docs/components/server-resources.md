---
id: null
key: "components/server-resources"
title: "Server resources"
section: "reference-packages"
description: "Show a w6w server's CPU, memory and process usage as a card, a rail strip or a header badge."
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

# Server resources

Four sizes of the same readout: how busy the server running W6W is. Each one shows the latest
sample, and all but the badge draw a sparkline from the whole history. They're props-only: you
fetch or stream the samples and pass them in.

| Component | Shows | Props |
| --- | --- | --- |
| `ServerResourcesCard` | CPU, memory and process memory, each with a sparkline, plus the load averages | `samples`, `title` (default `"Server resources"`), `intervalMs` (adds a "Sampled every Ns" line) |
| `ServerResourcesCardSmall` | CPU with a sparkline, and memory | `samples`, `title` (default `"Server"`) |
| `ServerResourcesRail` | CPU and memory stacked, each with a sparkline, sized for a narrow side column | `samples`, `onExpand` (adds a button to open a larger view) |
| `ServerResourcesBadge` | One line: `CPU <pct> · MEM <pct>` | `samples` |

## Samples

`samples` is an array of `ServerResourceSample`, oldest first. The last one is the current reading.
Every field except `ts` is a number or `null`:

| Field | What it is |
| --- | --- |
| `ts` | ISO-8601 time of the sample. |
| `cpus`, `cpuLimit` | Host CPU count, and the container's CPU limit when one is set. |
| `load1`, `load5`, `load15` | Load averages. CPU % is `load1` divided by `cpuLimit` (or `cpus`). |
| `memoryTotal`, `memoryAvailable`, `memoryLimit` | Bytes. Memory % is used over total. |
| `processRss`, `processHeapUsed`, `processHeapTotal` | The server process's own memory, in bytes. |

An unknown value renders as `—`, never as `0`, and an empty array still renders, all dashes. You
can mount a component before the first sample arrives.

## Feed it from your server

The W6W server keeps a rolling window of samples:

- `GET /server/resources` returns `{ intervalMs, retentionMs, samples }`.
- `GET /server/resources/stream` is a server-sent event stream: one `snapshot` event, then a
  `sample` event per new reading.

By default only operators can read them.

```tsx
import { ServerResourcesCard, type ServerResourceSample } from "@w6w/ui";

type Snapshot = { intervalMs: number; retentionMs: number; samples: ServerResourceSample[] };

const [snap, setSnap] = useState<Snapshot | null>(null);

useEffect(() => {
  // client: your @w6w/sdk client, signed in as an operator
  client.request<Snapshot>({ method: "GET", path: "/server/resources" }).then((res) => setSnap(res.body));
}, []);

<ServerResourcesCard samples={snap?.samples ?? []} intervalMs={snap?.intervalMs} />
```

To update live, read the stream instead and append each `sample` event to the array.

## Where to next

- **[Status and health](/reference-packages/components/status/)**: health pills and uptime for the APIs themselves.
- **[Components](/reference-packages/components/)**: every group.
