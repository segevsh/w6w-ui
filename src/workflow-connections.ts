import type { FlowStep, FlowWorkflow } from "./flow-types.ts";
import type { AuthDef, ConnectionSummary } from "./types.ts";

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
  const nodes = (workflow.nodes ?? []).map((step) => {
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

/** Drop only unreferenced aliases when serializing the complete workflow. */
export function pruneUnusedConnections<T extends Pick<FlowWorkflow, "connections" | "nodes">>(
  workflow: T,
): T {
  if (!workflow.connections) return workflow;
  const used = new Set(workflow.nodes.map((node) => node.uses.connectionRef));
  const entries = Object.entries(workflow.connections);
  const kept = entries.filter(([ref]) => used.has(ref));
  if (kept.length === entries.length) return workflow;
  return { ...workflow, connections: Object.fromEntries(kept) };
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

/** Accounts used anywhere in the workflow, including independently stored bindings. */
export function connectionUsers(
  app: string,
  connection: string | undefined,
  nodes: FlowStep[],
  connections: FlowConnections,
): FlowStep[] {
  if (!connection) return [];
  return nodes.filter((n) => n.uses.app === app && connectionIdFor(n, connections) === connection);
}

/** An explicit initial selection wins; otherwise inherit the last added configured node. */
export function defaultConnectionFor(
  step: FlowStep,
  choices: ConnectionSummary[],
  nodes: FlowStep[],
  connections: FlowConnections,
  initialConnection?: string,
): { connection?: string; connectionRef?: string } {
  if (initialConnection) return { connection: initialConnection };
  for (const node of [...nodes].reverse()) {
    if (node.id === step.id || node.uses.app !== step.uses.app) continue;
    const id = connectionIdFor(node, connections);
    if (!id || !choices.some((c) => c.id === id && c.appId === step.uses.app)) continue;
    return node.uses.connectionRef
      ? { connectionRef: node.uses.connectionRef }
      : { connection: id };
  }
  const sameApp = choices.filter((c) => c.appId === step.uses.app);
  const selected = sameApp.find((c) => c.builtIn) ?? sameApp[0];
  return selected ? { connection: selected.id } : {};
}

/** The server's zero-credential sentinel is a real picker choice, without creating a row. */
export function withDefaultConnection(
  appId: string,
  auths: AuthDef[],
  choices: ConnectionSummary[],
): ConnectionSummary[] {
  if (choices.some((c) => c.builtIn)) return choices;
  const allowed = auths.some(
    (a) =>
      a.available !== false &&
      (a.key === "zero-credential" ||
        (a.autoSatisfied === true && (a.type === "tenantAuth" || a.type === "jit"))),
  );
  if (!allowed) return choices;
  return [
    ...choices,
    {
      id: `zerocred:${appId}`,
      appId,
      authKey: "zero-credential",
      displayName: "Built-in",
      builtIn: true,
      state: "connected",
    },
  ];
}

/** Change every binding used by the displayed account's consumers, retaining reference keys. */
export function replaceWorkflowConnection(
  app: string,
  before: string,
  after: string,
  nodes: FlowStep[],
  connections: FlowConnections,
): FlowConnections {
  const refs = new Set(
    connectionUsers(app, before, nodes, connections).map((n) => n.uses.connectionRef),
  );
  return Object.fromEntries(
    Object.entries(connections).map(([ref, value]) => [
      ref,
      refs.has(ref) ? { ...value, connection: after } : value,
    ]),
  );
}
