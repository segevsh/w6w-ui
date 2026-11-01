import type { FlowStep, FlowWorkflow } from "./flow-types.ts";

export type FlowConnections = Record<string, { app: string; connection: string | null }>;

/** Missing/foreign bindings stay unresolved in the editor; the server rejects invalid references. */
export function connectionIdFor(step: FlowStep, connections?: FlowConnections): string | undefined {
  const { connectionRef, connection, app } = step.uses;
  if (connectionRef === undefined) return connection ?? undefined;
  const entry =
    connections && Object.hasOwn(connections, connectionRef)
      ? connections[connectionRef]
      : undefined;
  return entry?.app === app ? (entry.connection ?? undefined) : undefined;
}

function unusedKey(base: string, connections: FlowConnections): string {
  let key = base;
  for (let i = 2; Object.hasOwn(connections, key); i++) key = `${base}_${i}`;
  return key;
}

/** Lift old inline IDs on the next editor save. Independent bindings remain independent. */
export function centralizeConnections<T extends Pick<FlowWorkflow, "connections" | "nodes">>(
  workflow: T,
): T {
  let connections = workflow.connections ?? {};
  let changed = false;
  const nodes = workflow.nodes.map((step) => {
    if (!step.uses.connection || step.uses.connectionRef !== undefined) return step;
    const existing = Object.hasOwn(connections, step.id) ? connections[step.id] : undefined;
    const key =
      existing?.app === step.uses.app && existing.connection === step.uses.connection
        ? step.id
        : unusedKey(step.id, connections);
    connections = {
      ...connections,
      [key]: { app: step.uses.app, connection: step.uses.connection },
    };
    changed = true;
    return withConnectionRef(step, key);
  });
  return changed ? { ...workflow, nodes, connections } : workflow;
}

export function withConnectionRef(step: FlowStep, connectionRef: string): FlowStep {
  const { connection: _connection, ...uses } = step.uses;
  return { ...step, uses: { ...uses, connectionRef } };
}

/** An ordinary account selection affects this node only, detaching it from a shared entry. */
export function selectNodeConnection(
  step: FlowStep,
  connection: string | undefined,
  nodes: FlowStep[],
  connections: FlowConnections,
): { step: FlowStep; connections: FlowConnections } {
  if (!connection) {
    const { connection: _id, connectionRef: _ref, ...uses } = step.uses;
    return { step: { ...step, uses }, connections };
  }
  const ref = step.uses.connectionRef;
  const shared = ref && nodes.some((n) => n.id !== step.id && n.uses.connectionRef === ref);
  const key = ref && !shared ? ref : unusedKey(step.id, connections);
  return {
    step: withConnectionRef(step, key),
    connections: { ...connections, [key]: { app: step.uses.app, connection } },
  };
}

export function connectionSourceNodes(
  step: FlowStep,
  nodes: FlowStep[],
  connections: FlowConnections,
): FlowStep[] {
  return nodes.filter(
    (n) =>
      n.id !== step.id &&
      n.uses.app === step.uses.app &&
      n.uses.connectionRef !== undefined &&
      !!connectionIdFor(n, connections),
  );
}
