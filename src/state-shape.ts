/**
 * The workflow STATE a node can read, merged at design time: what the reference picker's
 * "State" section lists and what the ƒx previews resolve `state.<path>` against — no run needed.
 *
 * The shape at an anchor node = the starting data (`Workflow.initialState`), then the keys the
 * workflow's `variables` seed, then every WRITER (a node whose effective "Write to state" is not
 * Off) on a path that reaches the anchor, folded in the engine's order: Kahn's topological sort,
 * ties by declared node order, edges in declared order (`w6w-workflow` `plan.ts`). The writes
 * themselves come from `@w6w/expr`'s `computeStateWrites` / `foldState` — the SAME merge the
 * engine runs, never a second one here.
 *
 * A writer's output is what the editor already knows about it, in the editor's own tier order:
 * the last test output (fresh, else persisted), else the declared output (as a skeleton via
 * {@link shapeToSkeleton}), else the app's `sample`. Each field is flagged `all` when every entry
 * path into the anchor sets it (or the starting data / variables do), `some` otherwise — two
 * triggers converging on one node can each write different fields.
 *
 * Pure and JSX-free so `node --test` exercises it directly. Imports `step-preview-state.ts`
 * (for `ancestorIds`); that module never imports this one.
 */
import {
  type StateTree,
  type StateWriteOp,
  computeStateWrites,
  effectiveStateConfig,
  foldState,
} from "@w6w/expr";
import type { Edge } from "@xyflow/react";
import type { ExpressionStateField } from "./components/ExpressionOptions.tsx";
import { TRIGGER_APP, internalNodeDef } from "./flow-types.ts";
import type { FlowWorkflow } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";
import { type NodeShape, shapeToSkeleton } from "./node-samples.ts";
import { inferOutputFields, valueAtPath } from "./output-shape.ts";
import { type StepShapeContext, ancestorIds } from "./step-preview-state.ts";
import { asFieldDefs, fieldsToParams } from "./trigger-fields.ts";

/** The merged state at one anchor node. */
export interface StateShape {
  /** Every field path of the merged tree (depth/count capped like a step's output fields). */
  fields: ExpressionStateField[];
  /**
   * Preview values keyed by the ref the picker inserts (`state.<path>`), from REAL values only
   * (test outputs, the app's `sample`, starting data, variable defaults) — never a skeleton.
   */
  sampleValues: Record<string, unknown>;
}

export interface StateShapeInput {
  /** The node whose incoming state this is (`null` → empty shape). */
  anchorId: string | null | undefined;
  nodes: StepNode[];
  edges: Edge[];
  initialState?: FlowWorkflow["initialState"];
  variables?: FlowWorkflow["variables"];
  /** The same shape context the picker's "Previous steps" projection reads. */
  shapes?: StepShapeContext;
  /** Each node's REAL output (fresh test, else persisted), for preview values. */
  previewOutputs?: Record<string, unknown>;
}

const EMPTY: StateShape = { fields: [], sampleValues: {} };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The engine's run order over `nodes`/`edges`: Kahn's, the ready queue seeded in declared node
 * order, successors released in declared edge order. Nodes a cycle leaves out follow in declared
 * order (the engine refuses such a plan; the editor still has to show something).
 */
export function stateWriteOrder(nodes: StepNode[], edges: Edge[]): string[] {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target)) continue;
    outgoing.get(e.source)?.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const order: string[] = [];
  const ready = ids.filter((id) => indegree.get(id) === 0);
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const to of outgoing.get(id) ?? []) {
      const d = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, d);
      if (d === 0) ready.push(to);
    }
  }
  const placed = new Set(order);
  for (const id of ids) if (!placed.has(id)) order.push(id);
  return order;
}

const DECLARED_TYPES = new Set(["string", "number", "boolean", "object", "array"]);

/**
 * A declared `output` (`[{ key, type?, items? }]`, or a built-in node's `[{ key }]`) as a
 * {@link NodeShape}. An untyped leaf is a `string`: a `null` skeleton would DELETE the key when a
 * later writer merges into it (`foldState`'s null rule), losing a field the author can read.
 */
function declaredShape(output: unknown): NodeShape | undefined {
  if (!Array.isArray(output)) return undefined;
  const root: NodeShape = { type: "object", fields: {} };
  let any = false;
  for (const f of output) {
    if (!isPlainObject(f) || typeof f.key !== "string" || f.key === "") continue;
    const segs = f.key.split(".");
    let cur = root as { type: "object"; fields: Record<string, NodeShape> };
    for (const seg of segs.slice(0, -1)) {
      const next = cur.fields[seg];
      if (next?.type !== "object") cur.fields[seg] = { type: "object", fields: {} };
      cur = cur.fields[seg] as typeof cur;
    }
    const t = typeof f.type === "string" && DECLARED_TYPES.has(f.type) ? f.type : "string";
    let leaf: NodeShape;
    if (t === "array") {
      const items = declaredShape(f.items);
      leaf = items ? { type: "array", items } : { type: "array" };
    } else if (t === "object") {
      leaf = declaredShape(f.fields ?? f.properties) ?? { type: "object", fields: {} };
    } else {
      leaf = { type: t as "string" | "number" | "boolean" };
    }
    cur.fields[segs[segs.length - 1]] = leaf;
    any = true;
  }
  return any ? root : undefined;
}

/**
 * What one writer outputs, for the SHAPE: its test output (fresh, else persisted), else its
 * declared output as a skeleton, else the app's `sample`. `undefined` when nothing is known.
 */
function writerShapeOutput(node: StepNode, shapes: StepShapeContext): unknown {
  const step = node.data.step;
  const tested = shapes.testOutputs?.[step.id] ?? shapes.persistedOutputs?.[step.id];
  if (tested !== undefined && tested !== null) return tested;
  const { app, action } = step.uses;
  if (app === TRIGGER_APP && internalNodeDef(app, action)?.group === "trigger") {
    const keys = fieldsToParams(asFieldDefs(step.with?.fields)).map((p) => ({ key: p.key }));
    return shapeToSkeleton(declaredShape(keys));
  }
  const internal = internalNodeDef(app, action)?.output;
  if (internal && internal.length > 0) return shapeToSkeleton(declaredShape(internal));
  const def =
    step.uses.trigger === true ? shapes.triggerDef?.(app, action) : shapes.actionDef?.(app, action);
  const declared = declaredShape(def?.output);
  if (declared) return shapeToSkeleton(declared);
  return def?.sample;
}

/** What one writer outputs, for PREVIEW values: a real value only (never a skeleton). */
function writerPreviewOutput(node: StepNode, input: StateShapeInput): unknown {
  const step = node.data.step;
  const real = input.previewOutputs?.[step.id];
  if (real !== undefined && real !== null) return real;
  const { app, action } = step.uses;
  const def =
    step.uses.trigger === true
      ? input.shapes?.triggerDef?.(app, action)
      : input.shapes?.actionDef?.(app, action);
  return def?.sample;
}

/** A starting placeholder for a variable with no default, by its declared type. */
function variablePlaceholder(type: string | undefined): unknown {
  switch (type) {
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    default:
      return "";
  }
}

/** The tree the run starts from: starting data, then the workflow's variables (later wins). */
function seedTree(input: StateShapeInput, real: boolean): StateTree {
  const tree: StateTree = isPlainObject(input.initialState) ? { ...input.initialState } : {};
  for (const v of input.variables ?? []) {
    if (!v || typeof v.key !== "string" || v.key === "") continue;
    if (v.default !== undefined) tree[v.key] = v.default;
    else if (!real) tree[v.key] = variablePlaceholder(v.type);
  }
  return tree;
}

/** The field paths of `tree`, capped like a step's output fields (`inferOutputFields`). */
function fieldKeys(tree: unknown): string[] {
  return (inferOutputFields(tree) ?? []).map((f) => f.key);
}

/**
 * The merged state shape a node reads — see the file header. Empty (no fields) when nothing on
 * any path into `anchorId` writes state and there is no starting data or variable.
 */
export function computeStateShape(input: StateShapeInput): StateShape {
  const { anchorId, nodes, edges } = input;
  if (!anchorId) return EMPTY;
  const shapes = input.shapes ?? {};
  const ancestors = ancestorIds(anchorId, edges);
  ancestors.delete(anchorId);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const shapeOps: StateWriteOp[] = [];
  const previewOps: StateWriteOp[] = [];
  /** field path → the writers whose own writes produce it */
  const writersOf = new Map<string, Set<string>>();
  for (const id of stateWriteOrder(nodes, edges)) {
    if (!ancestors.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    const { app, action } = node.data.step.uses;
    const config = effectiveStateConfig(app, action, node.data.step.state);
    if (config.mode === "off") continue;
    const out = writerShapeOutput(node, shapes);
    if (out !== undefined) {
      const { ops } = computeStateWrites(config, out);
      shapeOps.push(...ops);
      for (const key of fieldKeys(foldState({}, ops))) {
        const set = writersOf.get(key) ?? new Set<string>();
        set.add(id);
        writersOf.set(key, set);
      }
    }
    const real = writerPreviewOutput(node, input);
    if (real !== undefined) previewOps.push(...computeStateWrites(config, real).ops);
  }

  const seed = seedTree(input, false);
  const tree = foldState(seed, shapeOps);
  const keys = fieldKeys(tree);
  if (keys.length === 0) return EMPTY;
  const seeded = new Set(fieldKeys(seed));

  // Entry nodes: ancestors with no parent among the ancestors. A field is on ALL paths when no
  // entry reaches the anchor without passing one of its writers.
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!ancestors.has(e.source)) continue;
    if (!ancestors.has(e.target) && e.target !== anchorId) continue;
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }
  const entries = [...ancestors].filter((id) => !(parents.get(id) ?? []).length);
  const onAllPaths = (writers: Set<string>): boolean => {
    const seen = new Set<string>();
    const stack = entries.filter((id) => !writers.has(id));
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (id === anchorId) return false;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const c of children.get(id) ?? []) if (!writers.has(c)) stack.push(c);
    }
    return true;
  };

  const preview = foldState(seedTree(input, true), previewOps);
  const fields: ExpressionStateField[] = [];
  const sampleValues: Record<string, unknown> = {};
  for (const key of keys) {
    const writers = writersOf.get(key) ?? new Set<string>();
    const all = seeded.has(key) || (writers.size > 0 && onAllPaths(writers));
    fields.push({ key, path: true, paths: all ? "all" : "some" });
    const v = valueAtPath(preview, key);
    if (v !== undefined) sampleValues[`state.${key}`] = v;
  }
  return { fields, sampleValues };
}
