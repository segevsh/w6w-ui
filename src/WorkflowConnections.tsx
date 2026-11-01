import { createContext, useContext } from "react";
import type { FlowStep } from "./flow-types.ts";
import type { ConnectionSummary } from "./types.ts";
import {
  type FlowConnections,
  connectionIdFor,
  connectionSourceNodes,
} from "./workflow-connections.ts";

export const WorkflowConnectionsContext = createContext<{
  nodes: FlowStep[];
  readOnly?: boolean;
  connections: FlowConnections;
  setConnections: (connections: FlowConnections) => void;
} | null>(null);

export function useWorkflowConnections() {
  return useContext(WorkflowConnectionsContext);
}

/** Reuses the account picker tile style. Candidates include every branch, not only ancestors. */
export function WorkflowConnectionSources({
  step,
  conns,
  onSelect,
}: {
  step: FlowStep;
  conns: ConnectionSummary[] | null;
  onSelect: (connectionRef: string) => void;
}) {
  const scope = useWorkflowConnections();
  const sources = scope
    ? connectionSourceNodes(step, scope.nodes, scope.connections).filter(
        (node) =>
          conns === null || conns.some((c) => c.id === connectionIdFor(node, scope.connections)),
      )
    : [];
  if (!sources.length || !scope) return null;
  return (
    <div className="w6w-stack">
      <span className="w6w-muted w6w-small">Use connection from a node</span>
      <div className="w6w-stepbuilder-list">
        {sources.map((node) => {
          const ref = node.uses.connectionRef;
          if (!ref) return null;
          const id = connectionIdFor(node, scope.connections);
          const account = conns?.find((c) => c.id === id);
          return (
            <button
              type="button"
              className="w6w-stepbuilder-item"
              key={node.id}
              disabled={scope.readOnly}
              onClick={() => onSelect(ref)}
            >
              <span className="w6w-stepbuilder-item-main">
                <strong>{node.id}</strong>
                <span className="w6w-muted w6w-small">{account?.displayName || id}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
