/**
 * Persisted node samples — the server's record of the last output SHAPE (and, when small enough,
 * the value) each node produced, from a step Test, a node run or a full run
 * (`GET /workflows/:id/node-samples`). The editor loads them once per workflow so the picker,
 * the ƒx previews and the Test tab still offer an upstream node's keys after a reload, a reopen or
 * another browser, without re-running anything.
 *
 * They are a FALLBACK under what the editor already holds: a fresh in-memory output (a saved
 * step-test's `lastRunOutput`) wins, unless the persisted sample is strictly newer. Field
 * inference (`inferOutputFields`) is the same either way — a skeleton carries the same keys as
 * the real value it was taken from.
 *
 * Pure and JSX-free so `node --test` exercises it directly.
 */

/** A node output's structural shape, as the server records it. */
export type NodeShape =
  | { type: "string" | "number" | "boolean" | "null" | "unknown" }
  | { type: "object"; fields: Record<string, NodeShape> }
  | { type: "array"; items?: NodeShape };

/** One persisted node sample (`GET /workflows/:id/node-samples` → `nodeSamples[]`). */
export interface NodeSample {
  nodeId: string;
  shape: NodeShape;
  /** The output itself, when the server kept it (omitted when too large — `sampleOmitted`). */
  sample?: unknown;
  sampleOmitted?: true;
  source: "step_test" | "node_run" | "run";
  runId?: string;
  /** ISO timestamp of the write. */
  updatedAt: string;
}

/**
 * A representative value of `shape`: `""`, `0`, `false`, `null`, an object of its fields, an
 * array of one item skeleton (`[]` when the item shape is unknown). `unknown` is `null`.
 */
export function shapeToSkeleton(shape: NodeShape | undefined): unknown {
  if (!shape || typeof shape !== "object") return null;
  switch (shape.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(shape.fields ?? {})) out[k] = shapeToSkeleton(v);
      return out;
    }
    case "array":
      return shape.items ? [shapeToSkeleton(shape.items)] : [];
    default:
      return null;
  }
}

/** Index `samples` by node id (the last entry for a repeated id wins). */
export function indexNodeSamples(
  samples: readonly NodeSample[] | undefined,
): Record<string, NodeSample> {
  const out: Record<string, NodeSample> = {};
  for (const s of samples ?? []) {
    if (s && typeof s.nodeId === "string" && s.nodeId !== "") out[s.nodeId] = s;
  }
  return out;
}

/** `true` when the persisted sample carries the real value (not just a shape). */
function hasSampleValue(s: NodeSample): boolean {
  return s.sampleOmitted !== true && "sample" in s && s.sample !== undefined;
}

/** `true` when `p` was written strictly after the fresh output's run time `freshAt`. */
function persistedIsNewer(p: NodeSample, freshAt: string | null | undefined): boolean {
  if (!freshAt) return false;
  const a = Date.parse(p.updatedAt);
  const b = Date.parse(freshAt);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/**
 * One node's effective output for SHAPE inference: the fresh in-memory output wins (unless the
 * persisted sample is strictly newer than `freshAt`), else the persisted `sample`, else
 * {@link shapeToSkeleton} of its shape. `undefined` when neither exists.
 */
export function effectiveNodeOutput(
  nodeId: string,
  fresh: Record<string, unknown>,
  persisted: Record<string, NodeSample>,
  freshAt?: Record<string, string | null | undefined>,
): unknown {
  const f = fresh[nodeId];
  const p = persisted[nodeId];
  if (f !== undefined && (!p || !persistedIsNewer(p, freshAt?.[nodeId]))) return f;
  if (!p) return f;
  return hasSampleValue(p) ? p.sample : shapeToSkeleton(p.shape);
}

/**
 * {@link effectiveNodeOutput} for every node with a fresh or persisted output — the map the
 * editor hands `StepShapeContext.testOutputs`, so a downstream node's picker offers the
 * persisted keys after a reload.
 */
export function effectiveNodeOutputs(
  fresh: Record<string, unknown>,
  persisted: Record<string, NodeSample>,
  freshAt?: Record<string, string | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of new Set([...Object.keys(fresh), ...Object.keys(persisted)])) {
    const v = effectiveNodeOutput(id, fresh, persisted, freshAt);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

/**
 * The outputs the Result PREVIEWS read: real values only — never a skeleton, which would preview
 * a made-up `""`/`0`. Same precedence as {@link effectiveNodeOutput}; a newer persisted sample
 * with no value falls back to the fresh one.
 */
export function previewNodeOutputs(
  fresh: Record<string, unknown>,
  persisted: Record<string, NodeSample>,
  freshAt?: Record<string, string | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fresh };
  for (const [id, p] of Object.entries(persisted)) {
    if (!hasSampleValue(p)) continue;
    if (fresh[id] === undefined || persistedIsNewer(p, freshAt?.[id])) out[id] = p.sample;
  }
  return out;
}

/**
 * {@link effectiveNodeOutputs} split into its two tiers, so the editor can hand the picker
 * `testOutputs` (fresh) and `persistedOutputs` (persisted) SEPARATELY and show the right hint.
 * A persisted sample wins only when there is no fresh output or it is strictly newer than
 * `freshAt`; then the fresh entry is dropped from `fresh` and the persisted shape (its kept
 * value, else its skeleton) goes in `persisted`. Elsewhere `fresh` is the fresh map unchanged.
 */
export function splitNodeOutputs(
  fresh: Record<string, unknown>,
  persisted: Record<string, NodeSample>,
  freshAt?: Record<string, string | null | undefined>,
): { fresh: Record<string, unknown>; persisted: Record<string, unknown> } {
  const outFresh: Record<string, unknown> = { ...fresh };
  const outPersisted: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(persisted)) {
    if (fresh[id] !== undefined && !persistedIsNewer(p, freshAt?.[id])) continue;
    delete outFresh[id];
    outPersisted[id] = hasSampleValue(p) ? p.sample : shapeToSkeleton(p.shape);
  }
  return { fresh: outFresh, persisted: outPersisted };
}

/**
 * {@link previewNodeOutputs} split into tiers: `persisted` holds only REAL kept values of the
 * persisted samples that win (never a skeleton); `fresh` is the fresh map minus those ids.
 */
export function splitPreviewOutputs(
  fresh: Record<string, unknown>,
  persisted: Record<string, NodeSample>,
  freshAt?: Record<string, string | null | undefined>,
): { fresh: Record<string, unknown>; persisted: Record<string, unknown> } {
  const outFresh: Record<string, unknown> = { ...fresh };
  const outPersisted: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(persisted)) {
    if (!hasSampleValue(p)) continue;
    if (fresh[id] === undefined || persistedIsNewer(p, freshAt?.[id])) {
      delete outFresh[id];
      outPersisted[id] = p.sample;
    }
  }
  return { fresh: outFresh, persisted: outPersisted };
}
