/**
 * Remembered test inputs — what the editor last ran each workflow node with
 * (`GET /workflows/:id/test-inputs`, `node_test_inputs` 0160), so the Run node
 * modal, the step / trigger Test tabs and the header Run reopen PREFILLED after
 * a success, a reload, another browser or the embed. Stored server-side per
 * (workflow, node), never in the workflow definition: remembering one never
 * dirties or versions the workflow.
 *
 * One slot per node: a trigger's filled fields, or any other node's
 * incoming-state override — a node is one or the other, so every surface that
 * collects for a node reads and writes the same slot.
 *
 * Pure and JSX-free so `node --test` exercises it directly.
 */
import type { ActionParam } from "./types.ts";
import { isExprValue, isSecretValue } from "./types.ts";

/** One remembered input (`GET /workflows/:id/test-inputs` → `testInputs[]`). */
export interface NodeTestInput {
  nodeId: string;
  input: Record<string, unknown>;
  /** ISO timestamp of the write. */
  updatedAt: string;
}

/**
 * The remembered input of `nodeId`: `undefined` when the node has no row (the
 * caller may fall back to an older source, e.g. the latest step-test fixture),
 * `{}` when it was CLEARED (stay on the declared defaults), else the values.
 */
export function findTestInput(
  rows: readonly NodeTestInput[] | undefined,
  nodeId: string,
): Record<string, unknown> | undefined {
  const row = (rows ?? []).find((r) => r && r.nodeId === nodeId);
  if (!row) return undefined;
  const input = row.input;
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

/** `true` when `v` is a binding (an `{{ … }}` string or an expression value), not a literal. */
function isBinding(v: unknown): boolean {
  return isExprValue(v) || (typeof v === "string" && v.includes("{{"));
}

/**
 * What may be remembered of `values`: a literal typed into a `secret` param is
 * DROPPED (it must never be persisted in plain text — the operator re-enters
 * it), a binding to a secret is kept as the expression, and a sealed envelope
 * is dropped anywhere at the top level (the server strips nested ones too).
 */
export function rememberableInput(
  values: Record<string, unknown>,
  params: readonly ActionParam[] = [],
): Record<string, unknown> {
  const secretKeys = new Set(params.filter((p) => p.type === "secret").map((p) => p.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || isSecretValue(v)) continue;
    if (secretKeys.has(k) && !isBinding(v)) continue;
    out[k] = v;
  }
  return out;
}
