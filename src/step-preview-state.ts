/**
 * The incoming state a single-step Test / ▶ Run is sent with, and the pure
 * graph logic that derives it. Extracted out of `WorkflowFlowEditor.tsx` so
 * `node --test` can exercise it directly — the same precedent `flow-connect.ts`
 * sets (see that file's own header comment); this module stays JSX-free.
 *
 * Three surfaces mount this state today, all from the SAME functions so they
 * cannot drift: the step editor's Test tab and the canvas ▶ Run collect form
 * (both already wired, unchanged by this move) and `StepBuilderModal`'s
 * add-step Test tab (T1.1.1 — the new caller, via {@link stepBuilderUpstreamSteps}).
 */
import type { Edge } from "@xyflow/react";
import type {
  ExpressionLoopSource,
  ExpressionStepSource,
} from "./components/ExpressionOptions.tsx";
import { wholeValueRef } from "./components/json-compose.ts";
import { isForeachStep, loopBodies, loopMembership } from "./flow-loop.ts";
import { TRIGGER_APP, internalNodeDef, isInternalApp } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";
import {
  type ActionShapeDef,
  inferOutputFields,
  resolveOutputShape,
  valueAtPath,
} from "./output-shape.ts";
import type { StepMeta, StepStartState, StepTest } from "./provider.tsx";
import { buildResolveScope, resolveParamValue } from "./resolve-params.ts";
import { asFieldDefs, fieldsToParams } from "./trigger-fields.ts";

/**
 * What the editor knows about upstream steps' output SHAPES beyond the static
 * `internalNodeDef(...).output` — both optional, so a caller without them gets
 * exactly the old projection.
 */
export interface StepShapeContext {
  /**
   * An app step's action definition (its declared `output` / `sample`).
   * `undefined` while that app's actions haven't loaded — the step then makes
   * no "run a test" claim it might have to retract a moment later.
   */
  actionDef?: (app: string, action: string) => ActionShapeDef | undefined;
  /** Each step's latest saved test-run output, by step id. */
  testOutputs?: Record<string, unknown>;
}

/** A graph ancestor carrying a saved step-test, offered as a one-click seed. */
export interface SeedSource {
  stepId: string;
  label: string;
  test: StepTest;
}

/**
 * `pendingConnect`'s shape (`WorkflowFlowEditor.tsx`'s state): the handle a
 * connection drag was released from, when it ended on empty canvas and opened
 * the step builder to create + auto-wire a new node. `position` is part of
 * that state too (where to place the new node) but unused by the direction
 * rule below, so it is deliberately omitted here — `pendingConnect`'s real
 * type carries it, and a wider object satisfies this narrower one structurally.
 */
interface PendingConnect {
  nodeId: string;
  handleType: "source" | "target";
  /** The lane the drag came off (WFE's `pendingConnect` carries it). */
  lane?: "success" | "error" | "each";
}

/** Every node id that is a graph ancestor of `rootId` — walks `edges` backward. */
function ancestorIds(rootId: string, edges: Edge[]): Set<string> {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const arr = parents.get(e.target) ?? [];
    arr.push(e.source);
    parents.set(e.target, arr);
  }
  const ancestors = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const p of parents.get(id) ?? []) {
      if (!ancestors.has(p)) {
        ancestors.add(p);
        stack.push(p);
      }
    }
  }
  return ancestors;
}

/**
 * Project the nodes in `ids` into `ExpressionStepSource`s, the one place that
 * decides trigger detection and declared-output projection — shared by
 * {@link upstreamStateSources} and {@link stepBuilderUpstreamSteps} so both
 * callers agree on what a trigger ancestor looks like.
 */
function projectStepSources(
  ids: Set<string>,
  nodes: StepNode[],
  shapes: StepShapeContext = {},
): { steps: ExpressionStepSource[]; hasTrigger: boolean } {
  const steps: ExpressionStepSource[] = [];
  let hasTrigger = false;
  for (const n of nodes) {
    if (!ids.has(n.id)) continue;
    const step = n.data.step;
    const isTrigger = internalNodeDef(step.uses.app, step.uses.action)?.group === "trigger";
    if (isTrigger) {
      // `trigger.event` stays on offer — but the trigger is ALSO a `steps.<id>`
      // source (see `upstreamStateSources`'s doc below), so it falls through to
      // the push.
      hasTrigger = true;
    }
    // Declared output fields, from one of two DISJOINT sources today — a
    // manual trigger's own `with.fields`, or a node's static `output`
    // declaration (`internalNodeDef(...).output`, e.g. `@w6w/template ·
    // render` / `@w6w/http · request`). A manual trigger never carries a
    // static `output` (INTERNAL_NODES declares one or the other, never both),
    // so this is written as explicit precedence rather than a merge that could
    // silently clobber one with the other: the manual-trigger path wins when
    // it applies, the static declaration is the fallback otherwise.
    //
    // MANUAL-TRIGGER-ONLY for the `with.fields` path: a webhook/scheduler
    // entry node's `with.fields` payload is `trigger.event` (see the
    // file-header-level doc below), not `steps.<id>.output`, so it must not be
    // projected here; on any other node `with.fields` is that action's INPUT,
    // and projecting it would fabricate declared outputs the step never
    // produces. The trigger-field parser already skips a blank/missing `key`.
    const isManualTrigger = isTrigger && step.uses.app === TRIGGER_APP;
    const declared: { key: string; label?: string }[] = isManualTrigger
      ? fieldsToParams(asFieldDefs(step.with?.fields)).map((p) => ({
          key: p.key,
          label: p.label,
        }))
      : (internalNodeDef(step.uses.app, step.uses.action)?.output ?? []);
    const source: ExpressionStepSource = { id: step.id, label: step.id };
    // OMITTED (not `[]`) when nothing is declared, so a consumer can tell
    // "nothing declared" from "declared none". Keys are verbatim: each becomes
    // `steps.<id>.output.<key>`, and only that form resolves at run time.
    if (declared.length > 0) {
      steps.push({ ...source, outputs: declared });
      continue;
    }
    // A webhook/scheduler entry node's payload is `trigger.event`, never
    // `steps.<id>.output` (see above), so no fallback shape applies to it.
    if (isTrigger) {
      steps.push(source);
      continue;
    }
    const testOutput = shapes.testOutputs?.[step.id];
    if (isInternalApp(step.uses.app)) {
      // A built-in node with no static output (`@w6w/script`, a Function
      // call, …): its last test run is the only shape there is.
      const fields = inferOutputFields(testOutput);
      steps.push(fields ? { ...source, outputs: fields, outputsFrom: "test" } : source);
      continue;
    }
    // An app action: its declared `output`, else its `sample`, else the last
    // test run (`output-shape.ts`). With none, the author has to run a test —
    // but only say so once the action definition has actually loaded.
    const action = shapes.actionDef?.(step.uses.app, step.uses.action);
    const shape = resolveOutputShape(action, testOutput);
    // Only this branch is an external app action, so only it carries `hasMeta` (R-7),
    // and only with a real app id (a blank `uses.app` is a half-built step).
    const meta = step.uses.app.trim() !== "" ? { hasMeta: true as const } : {};
    if (shape) {
      steps.push({ ...source, outputs: shape.fields, outputsFrom: shape.from, ...meta });
    } else {
      steps.push(action ? { ...source, needsTest: true, ...meta } : { ...source, ...meta });
    }
  }
  return { steps, hasTrigger };
}

/**
 * The array a For each's `items` resolves to at design time, or `undefined`.
 * A whole-value ref (`{{ nodes.x.output.tickets }}` / `{ "$": … }`) resolves through
 * `resolve-params.ts` against the saved test outputs; a literal array is returned as-is;
 * anything else (a non-array result, a multipart template, a missing ref) is `undefined`.
 */
export function resolveLoopItems(
  items: unknown,
  testOutputs: Record<string, unknown>,
): unknown[] | undefined {
  if (wholeValueRef(items) !== null) {
    const steps: Record<string, { output?: unknown }> = {};
    for (const [id, output] of Object.entries(testOutputs)) steps[id] = { output };
    const segs = resolveParamValue(items, buildResolveScope(undefined, { steps }));
    const seg = segs.length === 1 ? segs[0] : undefined;
    return seg?.status === "resolved" && Array.isArray(seg.value) ? seg.value : undefined;
  }
  return Array.isArray(items) ? items : undefined;
}

/**
 * The picker's loop-aware projection, in ONE place (never a filter in a caller).
 * `ownLoop` is the For each the anchor sits in the body of (or is about to join).
 * - Inside that body the For each itself is dropped (its own output does not exist yet),
 *   along with every OTHER loop's body steps; earlier body steps and the For each's own
 *   ancestors stay.
 * - Any other For each in scope (after the loop) keeps its place and offers `items` plus the
 *   LAST body step's fields as `items.0.<field>` (D-A11). Body steps are never offered.
 */
function loopAwareSources(
  ids: Set<string>,
  ownLoop: string | undefined,
  nodes: StepNode[],
  edges: Edge[],
  shapes: StepShapeContext = {},
): { steps: ExpressionStepSource[]; hasTrigger: boolean; extraSampleIds: string[] } {
  const membership = loopMembership(nodes, edges);
  const visible = new Set<string>();
  for (const id of ids) {
    if (id === ownLoop) continue;
    const owner = membership[id];
    if (owner !== undefined && owner !== ownLoop) continue;
    visible.add(id);
  }
  const projected = projectStepSources(visible, nodes, shapes);
  const bodies = loopBodies(nodes, edges);
  const extra: string[] = [];
  const steps = projected.steps.map((st): ExpressionStepSource => {
    const body = bodies.get(st.id);
    if (!body || body.length === 0) return st;
    const last = body[body.length - 1];
    const lastStep = nodes.find((n) => n.id === last)?.data.step;
    const testOutputs = shapes.testOutputs ?? {};
    const shape = lastStep
      ? resolveOutputShape(
          shapes.actionDef?.(lastStep.uses.app, lastStep.uses.action),
          testOutputs[last],
        )
      : undefined;
    if (!extra.includes(last)) extra.push(last);
    const fields = (shape?.fields ?? []).map((f) => ({
      key: `items.0.${f.key}`,
      path: true as const,
    }));
    return {
      id: st.id,
      label: st.label,
      outputs: [{ key: "items", path: true }, ...fields],
      ...(shape ? { outputsFrom: shape.from } : {}),
    };
  });
  return { steps, hasTrigger: projected.hasTrigger, extraSampleIds: extra };
}

/** The `loop` source for a step in `foreachId`'s body — keys absent when unresolvable. */
function loopSourceFor(
  foreachId: string,
  nodes: StepNode[],
  shapes: StepShapeContext = {},
): ExpressionLoopSource {
  const loop: ExpressionLoopSource = { foreachId };
  const items = nodes.find((n) => n.id === foreachId)?.data.step.with?.items;
  const arr = resolveLoopItems(items, shapes.testOutputs ?? {});
  if (arr && arr.length > 0) {
    loop.itemSample = arr[0];
    const outputs = inferOutputFields(arr[0]);
    if (outputs) loop.itemOutputs = outputs;
  }
  return loop;
}

/**
 * The workflow state a given step can reference: the outputs of every step
 * that runs before it (its graph ancestors) plus whether a trigger precedes
 * it.
 *
 * A trigger ancestor is **both**. It is pushed into `steps` like any other
 * ancestor — `core/rfcs/node-types.md` ("Triggers as nodes"): *"Executing a
 * trigger node yields the run's start payload … which downstream nodes read as
 * `steps.<triggerId>.output`"* — **and** it sets `hasTrigger`, which offers the
 * separate `trigger.event` root. The two are different values, not two spellings
 * of one: `trigger.event` is the dispatcher-delivered event payload (seeded from
 * `seed.event`), while a manual trigger's filled fields land under
 * `steps.<id>.output`. Offering only the former is why a trigger's declared
 * fields were unreachable from the picker.
 *
 * A **manual trigger** that declares output fields (`with.fields`) carries
 * them as `outputs`, so a consumer can offer `steps.<id>.output.<key>` per
 * field. Only a manual trigger: `fields` is an ordinary param name, and on any
 * other node — including a webhook/scheduler entry node, whose payload is
 * `trigger.event` instead (see the ⚠️ note below) — it holds that action's
 * INPUT; an `@w6w/http:request` with `with.fields = [{key:"x"}]` would
 * otherwise be advertised as declaring an output `x` it never produces. The
 * manual trigger's `fields` is the one case where the param IS the output
 * contract (`core/rfcs/node-types.md:194-196`; `trigger.md:119` covers only
 * what drives editor autocomplete).
 *
 * ⚠️ These declared fields resolve differently on each run path. On the
 * **single-step Test / ▶ Run** path (below), this editor sends a start state
 * seeded from the upstream saved fixtures (see {@link startStateFromSeeds})
 * which `POST /apps/:id/actions/:key/invoke` projects onto
 * `steps.<id>.output`. On a **full run**, a manual trigger's declared fields
 * resolve too: `POST /workflows/:id/run` accepts an `input` body field, and
 * `run-workflow.ts` seeds the `@w6w/trigger` node's own output with it
 * (verified by `server/e2e/trigger_run_payload_e2e_test.ts`). A
 * webhook/scheduler entry node's declared fields do **not** resolve on a full
 * run — its payload there is `trigger.event`, not `steps.<id>.output`, by
 * design (`core/rfcs/trigger.md:378`) — which is exactly why the projection
 * above is narrowed to a manual trigger only.
 *
 * With no specific step (shouldn't happen for a field edit) every node is offered.
 */
export function upstreamStateSources(
  editingId: string | null,
  nodes: StepNode[],
  edges: Edge[],
  shapes?: StepShapeContext,
  draftId?: string | null,
): {
  steps: ExpressionStepSource[];
  hasTrigger: boolean;
  /** Present iff the anchor step is a loop-body member. */
  loop?: ExpressionLoopSource;
  /** Saved tests the projection reads beyond `steps` (enclosing-ahead For each's last body step). */
  extraSampleIds?: string[];
} {
  // `draftId` anchors the add-step builder's rail, but only for a draft that already sits in a
  // loop body; every other builder add (floating, or outside a body) keeps offering every node.
  let anchor = editingId;
  if (!anchor && draftId && loopMembership(nodes, edges)[draftId] !== undefined) anchor = draftId;
  if (!anchor) return projectStepSources(new Set(nodes.map((n) => n.id)), nodes, shapes);
  const ownLoop = loopMembership(nodes, edges)[anchor];
  const out = loopAwareSources(ancestorIds(anchor, edges), ownLoop, nodes, edges, shapes);
  return {
    steps: out.steps,
    hasTrigger: out.hasTrigger,
    ...(ownLoop ? { loop: loopSourceFor(ownLoop, nodes, shapes) } : {}),
    ...(out.extraSampleIds.length > 0 ? { extraSampleIds: out.extraSampleIds } : {}),
  };
}

/**
 * The new add-step wizard's graph ancestors, derived from `pendingConnect` —
 * the handle a connection drag was released from before the builder opened
 * (`null` for a floating add with no drag at all).
 *
 * **Direction matters.** `addBuiltStep`'s edge-wiring ternary
 * (`WorkflowFlowEditor.tsx`) only makes the new step DOWNSTREAM of
 * `pendingConnect.nodeId` when the drag came off a **source** handle
 * (`[pendingConnect.nodeId, id]`); off a **target** handle the new step becomes
 * the edge's SOURCE instead (`[id, pendingConnect.nodeId]`), so
 * `pendingConnect.nodeId` ends up downstream of the new step, not upstream —
 * offering it as a seed would be backwards. A `handleType: "source"` drag
 * carries the dragged node itself (it IS upstream of the step about to be
 * created) plus that node's own ancestors, via the same projection
 * {@link upstreamStateSources} uses.
 */
export function stepBuilderUpstreamSteps(
  pendingConnect: PendingConnect | null,
  nodes: StepNode[],
  edges: Edge[],
  shapes?: StepShapeContext,
): ExpressionStepSource[] {
  if (!pendingConnect || pendingConnect.handleType === "target") return [];
  const ids = ancestorIds(pendingConnect.nodeId, edges);
  ids.add(pendingConnect.nodeId);
  // A drag off a For each's Each-item handle puts the new step IN that body; a drag off a body
  // step keeps it in that step's body. Off the Done side the For each stays on offer.
  const dragged = nodes.find((n) => n.id === pendingConnect.nodeId);
  const ownLoop =
    pendingConnect.lane === "each" && isForeachStep(dragged?.data.step)
      ? pendingConnect.nodeId
      : loopMembership(nodes, edges)[pendingConnect.nodeId];
  return loopAwareSources(ids, ownLoop, nodes, edges, shapes).steps;
}

/**
 * Gather each graph ancestor's latest saved step-test so the incoming-state
 * control can offer it as a seed. **One implementation**, called by every
 * surface that mounts {@link SeedSource}s — the step editor's Test tab, the
 * canvas ▶ Run collect form, and `StepBuilderModal`'s add-step Test tab — so
 * the `gate_1 · succeeded` chip behaves identically everywhere.
 *
 * `listStepTests` is injected (rather than reached for via `useW6WApi()`
 * directly) so this stays a plain async function `node --test` can call with a
 * stub — the React-facing wrapper is `use-seed-sources.ts`'s `useSeedSources`.
 * It returns oldest-first per step, so the last entry is the most recent
 * fixture. A step with no saved fixture (an empty list, or a lookup that
 * throws) contributes nothing — best-effort, per step, never breaking the rest.
 */
export async function fetchSeedSources(
  listStepTests: (stepId: string) => Promise<StepTest[]>,
  upstreamSteps: ExpressionStepSource[],
): Promise<SeedSource[]> {
  const results = await Promise.all(
    upstreamSteps.map(async (s): Promise<SeedSource | null> => {
      try {
        const tests = await listStepTests(s.id);
        const latest = tests.length ? tests[tests.length - 1] : null;
        return latest ? { stepId: s.id, label: s.label ?? s.id, test: latest } : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is SeedSource => r !== null);
}

/**
 * The start state a single-step Test / ▶ Run is sent with: **the last-known
 * saved output of each upstream step**, keyed by step id, in the shape the
 * invoke route accepts (`{ steps: { <id>: { output } } }` — the server's
 * `StartStateInput`, `packages/api/ambient-scope.ts`). It is what makes a
 * `with` block written as `{{ steps.<id>.output.<field> }}` resolve to the
 * value that step last produced instead of concatenating as `""`.
 *
 * Read from the same `step_tests` fixtures the seed chips offer — no upstream
 * step is re-run to produce it, and nothing here is computed live.
 *
 * A step whose fixture never captured an output contributes **no entry** rather
 * than an empty one, and a set with no outputs at all returns `undefined` so
 * the invoke body carries no `state` key at all (byte-identical to a request
 * from before this existed). Each id gets its OWN `{ output }` object: sharing
 * one would make every reference resolve the last step's data.
 *
 * ⚠️ Single-step scope only. A full run (`POST /workflows/:id/run`) builds its
 * own scope and is not affected by this.
 */
export function startStateFromSeeds(seeds: SeedSource[]): StepStartState | undefined {
  const steps: Record<string, { output?: unknown; meta?: StepMeta }> = {};
  for (const s of seeds) {
    const output = s.test.lastRunOutput;
    const hasOutput = output !== undefined && output !== null;
    // `lastRunOutput` is NULL for both "never ran" and "ran and returned null"
    // (`rowToStepTest`), so only a succeeded status tells them apart. A failed
    // run is never seeded, even when it carries meta (meta reaches scope for
    // succeeded steps only).
    if (!hasOutput && s.test.lastRunStatus !== "succeeded") continue;
    const meta = s.test.lastRunMeta;
    steps[s.stepId] = { output: hasOutput ? output : null, ...(meta ? { meta } : {}) };
  }
  return Object.keys(steps).length > 0 ? { steps } : undefined;
}

/**
 * Sample values for a step's `nodes.<id>.meta.*` refs (and the `steps.` alias), from a saved fixture's
 * `lastRunMeta`. Reads the four named fields only; absent meta yields nothing
 * (a version or connection is never derived from anywhere else).
 */
export function stepMetaSampleValues(
  stepId: string,
  meta: StepMeta | null | undefined,
): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  // `nodes.` is what the picker inserts; `steps.` stays as its compat alias.
  for (const root of ["nodes", "steps"]) {
    const p = `${root}.${stepId}.meta`;
    out[`${p}.app`] = meta.app;
    out[`${p}.version`] = meta.version;
    out[`${p}.action`] = meta.action;
    out[`${p}.connectionId`] = meta.connectionId;
  }
  return out;
}

/**
 * The flat `sampleValues` the expression editor's Result preview reads: each upstream step's
 * last test output on the very refs the picker inserts (`nodes.<id>.output`, `.output.<key>`,
 * each offered nested path), mirrored under `steps.` (the compat alias), plus metadata and,
 * for a loop-body step, `foreach.item` / `foreach.item.<key>` / `foreach.index` (= 0, the
 * sample element's position). Lives here (not in WFE) so a render test can drive it.
 */
export function upstreamSampleValues(
  steps: ExpressionStepSource[],
  testOutputs: Record<string, unknown>,
  testMetas: Record<string, StepMeta>,
  loop?: ExpressionLoopSource,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const put = (path: string, value: unknown) => {
    next[`nodes.${path}`] = value;
    next[`steps.${path}`] = value;
  };
  for (const st of steps) {
    Object.assign(next, stepMetaSampleValues(st.id, testMetas[st.id]));
    const output = testOutputs[st.id];
    if (output === undefined) continue;
    put(`${st.id}.output`, output);
    if (typeof output === "object" && output !== null && !Array.isArray(output)) {
      for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
        put(`${st.id}.output.${k}`, v);
      }
    }
    for (const o of st.outputs ?? []) {
      if (!o.path || !o.key.includes(".")) continue;
      const v = valueAtPath(output, o.key);
      if (v !== undefined) put(`${st.id}.output.${o.key}`, v);
    }
  }
  if (loop && "itemSample" in loop) {
    next["foreach.item"] = loop.itemSample;
    for (const o of loop.itemOutputs ?? []) {
      const v = valueAtPath(loop.itemSample, o.key);
      if (v !== undefined) next[`foreach.item.${o.key}`] = v;
    }
    next["foreach.index"] = 0;
  }
  return next;
}
