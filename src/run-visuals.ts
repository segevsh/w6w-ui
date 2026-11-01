/**
 * Pure derivation of a live run's canvas visuals (T1.1.1) — step node styling
 * and main-graph edge taken/skipped/untouched state. Plain functions of (run
 * state, step/edge identity) → visual state, with **no React import**, so
 * `node --test` exercises them directly (A7) the same way `flow-connect.ts`'s
 * connection rules do.
 *
 * `RunStatus`/`StepStatus`/`RunState`/`StepExecution` below are thin LOCAL
 * copies of the shapes `@w6w/workflow-types` declares
 * (`packages/w6w-workflow/packages/types/mod.ts`) — the same house idiom
 * `components/HealthStatusPill.tsx`'s `HealthPillState` uses, and the same
 * design note `flow-types.ts`'s own header already states for
 * `FlowWorkflow`/`FlowStep`: `packages/ui/package.json` has no dependency on
 * `@w6w/workflow-types` and must not gain one, so this module stays a
 * pure-presentation leaf with no transport/spec coupling. A caller who
 * already has the real `RunState`/`StepExecution` is structurally compatible
 * for free.
 */
import { type CanvasLane, FOREACH_DONE_ROUTE } from "./flow-types.ts";

/** Mirrors `RunStatus` in `@w6w/workflow-types`. */
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
/** Mirrors `StepStatus` in `@w6w/workflow-types`. */
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/** The slice of `StepExecution` this module reads. */
export interface StepExecution {
  status: StepStatus;
  /** Why a `skipped` step did not run; `"not_on_path"` = never part of this run (no paint). */
  skipReason?: string;
  output?: unknown;
  /** For each only (I3): per-iteration body-step records, keyed by body-step id. */
  iterations?: ReadonlyArray<{ nodes?: Record<string, { status: StepStatus }> }>;
}

/** The slice of `RunState` this module reads — steps keyed by step id, same
 *  as the engine's own `RunState.steps`. */
export interface RunState {
  status: RunStatus;
  /** Canonical per-node records (D2). */
  nodes?: Record<string, StepExecution>;
  /** Legacy alias of `nodes`; read as `nodes ?? steps` (un-upgraded server). */
  steps?: Record<string, StepExecution>;
}

function execOf(runState: RunState, id: string): StepExecution | undefined {
  return (runState.nodes ?? runState.steps)?.[id];
}

/** A step on another path — not downstream of the fired trigger, or outside a run-from-node
 *  scope. It was never part of this run, so it and its edges get no run paint at all. */
function offPath(runState: RunState, id: string): boolean {
  const rec = execOf(runState, id);
  return rec?.status === "skipped" && rec.skipReason === "not_on_path";
}

const RUN_ENDED: ReadonlySet<RunStatus> = new Set(["succeeded", "failed", "canceled"]);

/**
 * A step node's rendered state — exactly the five {@link StepStatus} values
 * plus `"no-run"` (A2): `runState` omitted ⇒ `"no-run"` (this canvas isn't
 * showing any run). A step present in `runState.steps` renders its own
 * recorded status; a step the run hasn't reached yet has no entry there at
 * all (only steps that were actually started/skipped get a `StepExecution` —
 * see the engine's `recordSkipped`), so absence reads as `"pending"`.
 */
export type StepVisualState = "no-run" | StepStatus;

/**
 * The rendered state for step `stepId` under `runState` — the StepStatus
 * half of A3's RunStatus × StepStatus mapping. Pure function of the run's own
 * step records; no additional data needed (`GET /runs/:id` already returns
 * everything this reads). A step whose record says `skipReason: "not_on_path"` (or whose
 * enclosing loop's does) was never part of the run: `"no-run"`, the unpainted look.
 */
export function stepVisualState(
  runState: RunState | undefined,
  stepId: string,
  loops: readonly string[] = [],
): StepVisualState {
  // `loops`: the For each steps enclosing `stepId` — a body step of a loop on another path is
  // off the path too.
  if (!runState || [...loops, stepId].some((id) => offPath(runState, id))) return "no-run";
  const own = execOf(runState, stepId);
  if (own) return own.status;
  // A For each body node has no record of its own (D-R1): derive from the owning
  // loop's iterations — failed > running > succeeded > skipped, else pending.
  const seen = new Set<StepStatus>();
  for (const rec of Object.values(runState.nodes ?? runState.steps ?? {})) {
    if (!Array.isArray(rec?.iterations)) continue;
    for (const it of rec.iterations) {
      const s = it?.nodes?.[stepId]?.status;
      if (s) seen.add(s);
    }
  }
  for (const s of ["failed", "running", "succeeded", "skipped"] as const) {
    if (seen.has(s)) return s;
  }
  return "pending";
}

/** One node's non-persisted, run-aware look. Colour is never the only signal
 *  (the house rule `HealthStatusPill`'s own doc comment states) — every
 *  non-default state also differs from the default (`"no-run"`) in
 *  `borderStyle`, `borderWidth`, or `opacity`. */
export interface StepNodeVisual {
  borderColor: string;
  borderStyle: "solid" | "dashed";
  borderWidth: number;
  opacity: number;
}

const NO_RUN_VISUAL: StepNodeVisual = {
  borderColor: "var(--w6w-border)",
  borderStyle: "solid",
  borderWidth: 1,
  opacity: 1,
};

/**
 * The node visual for a step's {@link StepVisualState}, `runStatus`
 * (the owning run's OWN status) additionally distinguishing the `"pending"`
 * case — A3: a `canceled`/`failed` run's not-yet-reached steps render
 * dimmer/muted (they never will run) than a `queued`/`running` run's
 * not-yet-reached steps (they still might), even though both share the same
 * `StepVisualState`. Every token used is one of the five named in
 * `context.notes` (`--w6w-accent`/`--w6w-success`/`--w6w-danger`/
 * `--w6w-muted`/`--w6w-border`) — never a literal hex, never a different
 * token family.
 */
export function stepNodeVisual(state: StepVisualState, runStatus?: RunStatus): StepNodeVisual {
  const runEnded = runStatus !== undefined && RUN_ENDED.has(runStatus);
  switch (state) {
    case "no-run":
      return NO_RUN_VISUAL;
    case "pending":
      return runEnded
        ? { borderColor: "var(--w6w-muted)", borderStyle: "dashed", borderWidth: 1, opacity: 0.5 }
        : { borderColor: "var(--w6w-border)", borderStyle: "dashed", borderWidth: 1, opacity: 1 };
    case "running":
      return { borderColor: "var(--w6w-accent)", borderStyle: "solid", borderWidth: 2, opacity: 1 };
    case "succeeded":
      return {
        borderColor: "var(--w6w-success)",
        borderStyle: "solid",
        borderWidth: 2,
        opacity: 1,
      };
    case "failed":
      return { borderColor: "var(--w6w-danger)", borderStyle: "solid", borderWidth: 2, opacity: 1 };
    case "skipped":
      return {
        borderColor: "var(--w6w-muted)",
        borderStyle: "dashed",
        borderWidth: 1,
        opacity: 0.7,
      };
    default:
      return NO_RUN_VISUAL;
  }
}

// ── Edge inference (main-graph `when` edges only — no `if`/then-else
// sub-block inference: the canvas has no rendering or authoring path for
// that construct today, see FOLLOWUPS.md) ───────────────────────────────

/** Whether a main-graph edge was taken, skipped, or left untouched by the
 *  run (`undefined` — the source step hasn't been decided yet, or there is
 *  no run). */
export type EdgeRunState = "taken" | "skipped";

/**
 * Whether the edge `from --(when)--> …` was taken or skipped in `runState` —
 * computable from the run's step records alone (no engine data beyond what
 * `GET /runs/:id` already returns):
 *   - `from` **succeeded**: its `"success"`/omitted-`when` edges are taken,
 *     its `"error"` edges are skipped.
 *   - `from` **failed**: a declared `"error"` edge is taken, every other
 *     outgoing edge (the `"success"` lane) is skipped.
 *   - `from` was itself **skipped** (reached only through a skipped edge —
 *     the engine's own `recordSkipped`/`markOutgoingEdgesSkipped`): every
 *     outgoing edge is skipped too, regardless of lane — a step that never
 *     ran cannot have taken an exit.
 *   - `from` is **running**, or has no record at all (not yet reached): the
 *     edge's fate isn't decided yet ⇒ `undefined`.
 */
export function edgeRunState(
  runState: RunState | undefined,
  from: string,
  when: CanvasLane | undefined,
  route?: string,
  to?: string,
): EdgeRunState | undefined {
  if (!runState || offPath(runState, from) || (to !== undefined && offPath(runState, to))) {
    return undefined;
  }
  const state = edgeStateFromSource(runState, from, when, route);
  // An edge into a step that was skipped was not taken, whatever its source did (a For each
  // whose body hit Stop workflow still succeeded, but nothing on Done ran).
  if (state === "taken" && to !== undefined && execOf(runState, to)?.status === "skipped") {
    return "skipped";
  }
  return state;
}

function edgeStateFromSource(
  runState: RunState,
  from: string,
  when: CanvasLane | undefined,
  route?: string,
): EdgeRunState | undefined {
  const exec = execOf(runState, from);
  if (!exec) return undefined;
  // Each lane: a body edge's fate is not decidable from the parent's record (body
  // ids are never `RunState.nodes` keys) — only a skipped parent skips it.
  if (when === "each") return exec.status === "skipped" ? "skipped" : undefined;
  const lane = when ?? "success";
  const output = exec.output;
  // A For each's Done route is its plain success exit (a Router's routes carry `route`).
  const done =
    route === FOREACH_DONE_ROUTE && !(output && typeof output === "object" && "route" in output);
  if (route !== undefined && !done && exec.status === "succeeded") {
    // An If's routed edge (its False port, or an explicit "true") follows `matched`.
    if (output && typeof output === "object" && "matched" in output) {
      return (route === "false") !== (output.matched === true) ? "taken" : "skipped";
    }
    return output && typeof output === "object" && "route" in output && output.route === route
      ? "taken"
      : "skipped";
  }
  if (exec.status === "succeeded") return lane === "success" ? "taken" : "skipped";
  if (exec.status === "failed") return lane === "error" ? "taken" : "skipped";
  if (exec.status === "skipped") return "skipped";
  return undefined;
}
