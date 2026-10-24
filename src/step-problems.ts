/**
 * Host-supplied per-step problems painted on the canvas. Pure — no React or
 * @xyflow imports. The host owns detection; ui never infers a problem itself.
 */
export interface StepProblem {
  code: "unknown_connection";
  connection: string;
}

/** Keyed by step id. */
export type StepProblems = Record<string, StepProblem>;

interface ProblemNode {
  id: string;
  data: { stepProblem?: StepProblem };
}

/**
 * Stamp `data.stepProblem` from `problems`, clearing it for steps no longer in
 * the map. Returns the SAME node object when nothing changed.
 */
export function applyStepProblems<N extends ProblemNode>(
  nodes: N[],
  problems: StepProblems | undefined,
): N[] {
  return nodes.map((n) => {
    const next = problems?.[n.id];
    const cur = n.data.stepProblem;
    if (next === undefined) {
      if (cur === undefined && !("stepProblem" in n.data)) return n;
      const { stepProblem: _drop, ...rest } = n.data;
      return { ...n, data: rest } as N;
    }
    if (cur && cur.code === next.code && cur.connection === next.connection) return n;
    return { ...n, data: { ...n.data, stepProblem: { ...next } } };
  });
}

export function stepProblemTooltip(p: StepProblem): string {
  return `Connection ${p.connection} no longer exists`;
}

/** The Setup tab's Connection button label — exactly five outcomes. */
export function connectionButtonLabel(
  connection: string | undefined | null,
  conns: { id: string; displayName?: string }[] | null,
  failed: boolean,
): string {
  if (!connection) return "No connection";
  if (failed) return "Couldn't load connections";
  if (conns === null) return connection;
  const found = conns.find((c) => c.id === connection);
  if (found) return found.displayName ?? connection;
  return "Missing connection — choose another";
}
