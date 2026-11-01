import { type RefObject, createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { AnchoredFlyout } from "./components/AnchoredFlyout.tsx";
import { Modal } from "./components/Modal.tsx";
import type { FlowStep } from "./flow-types.ts";
import { connectionButtonLabel } from "./step-problems.ts";
import type { ConnectionSummary } from "./types.ts";
import {
  type FlowConnections,
  connectionIdFor,
  connectionUsers,
  replaceWorkflowConnection,
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

/** One account menu for both adding and editing workflow nodes. */
export function WorkflowConnectionPicker({
  step,
  conns,
  failed = false,
  readOnly,
  open,
  onOpenChange,
  anchorRef,
  onChangeConnection,
  onChangeConnectionRef,
  onConnectionCreated,
}: {
  step: FlowStep;
  conns: ConnectionSummary[] | null;
  failed?: boolean;
  readOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  onChangeConnection: (id: string) => void;
  onChangeConnectionRef: (ref: string) => void;
  onConnectionCreated: () => void;
}) {
  const scope = useWorkflowConnections();
  const disabled = readOnly || scope?.readOnly;
  const connections = scope?.connections ?? {};
  const nodes = scope?.nodes ?? [];
  const choices = (conns ?? [])
    .map((conn) => ({ conn, users: connectionUsers(step.uses.app, conn.id, nodes, connections) }))
    .sort((a, b) => Number(b.users.length > 0) - Number(a.users.length > 0));
  const currentId =
    connectionIdFor(step, connections) ??
    (step.uses.connectionRef === undefined
      ? conns?.find((c) => c.builtIn && c.appId === step.uses.app)?.id
      : undefined);
  const peers = connectionUsers(step.uses.app, currentId, nodes, connections).filter(
    (n) => n.id !== step.id,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Dialogs are siblings of the enclosing dialog, never nested in its body.
  const portalHost =
    pending || creating
      ? (anchorRef.current?.closest("dialog")?.parentElement ?? document.body)
      : null;

  const apply = (id: string, all: boolean) => {
    if (disabled) return;
    if (all && scope && currentId) {
      scope.setConnections(
        replaceWorkflowConnection(step.uses.app, currentId, id, nodes, connections),
      );
      const bound = nodes.find((n) => n.id === step.id) ?? step;
      if (bound.uses.connectionRef) onChangeConnectionRef(bound.uses.connectionRef);
      else onChangeConnection(id);
    } else {
      const source = connectionUsers(step.uses.app, id, nodes, connections)
        .filter((n) => n.id !== step.id && n.uses.connectionRef)
        .at(-1);
      if (source?.uses.connectionRef) onChangeConnectionRef(source.uses.connectionRef);
      else onChangeConnection(id);
    }
    setPending(null);
    onOpenChange(false);
  };
  const choose = (id: string) => {
    if (disabled) return;
    onOpenChange(false);
    if (id === currentId) return;
    if (peers.length > 0 && nodes.some((n) => n.id === step.id)) setPending(id);
    else apply(id, false);
  };

  return (
    <>
      <button
        type="button"
        className="w6w-app-conn-btn"
        aria-label="Connection"
        aria-expanded={open}
        disabled={disabled || (conns === null && !failed)}
        onClick={() => onOpenChange(!open)}
      >
        <span className="w6w-conn-label-name">
          {conns === null && !failed && !currentId
            ? "Loading connections…"
            : connectionButtonLabel(currentId, conns, failed)}
        </span>
      </button>
      {open && (
        <AnchoredFlyout anchorRef={anchorRef} onClose={() => onOpenChange(false)}>
          <div className="w6w-stack">
            {failed && (
              <p role="alert" className="w6w-field-error">
                Couldn’t load connections.
              </p>
            )}
            <div className="w6w-stepbuilder-list">
              {choices.map(({ conn, users }) => {
                return (
                  <button
                    key={conn.id}
                    type="button"
                    className="w6w-stepbuilder-item"
                    disabled={disabled}
                    aria-pressed={conn.id === currentId}
                    data-connection-id={conn.id}
                    onClick={() => choose(conn.id)}
                  >
                    <span className="w6w-stepbuilder-item-main">
                      <strong>{conn.builtIn ? "Built-in" : conn.displayName || conn.id}</strong>
                      <span className="w6w-muted w6w-small">
                        {users.length > 0
                          ? `In use in this workflow · ${users.map((n) => n.id).join(", ")}`
                          : conn.builtIn
                            ? "Built-in connection"
                            : conn.state}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="w6w-btn"
              disabled={disabled}
              onClick={() => {
                onOpenChange(false);
                setCreating(true);
              }}
            >
              + New connection
            </button>
          </div>
        </AnchoredFlyout>
      )}
      {creating &&
        portalHost &&
        createPortal(
          <AddConnectionModal
            initialAppId={step.uses.app}
            onClose={() => setCreating(false)}
            onCreated={({ connectionId }) => {
              setCreating(false);
              onConnectionCreated();
              choose(connectionId);
            }}
          />,
          portalHost,
        )}
      {pending &&
        portalHost &&
        createPortal(
          <Modal title="Change connection" onClose={() => setPending(null)}>
            <div className="w6w-modal-body">
              <p>Change the connection for all these nodes, or only this node?</p>
              <ul>
                <li>{step.id || "New node"}</li>
                {peers.map((n) => (
                  <li key={n.id}>{n.id}</li>
                ))}
              </ul>
            </div>
            <div className="w6w-modal-actions">
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                disabled={disabled}
                onClick={() => apply(pending, true)}
              >
                All {peers.length + 1} nodes
              </button>
              <button
                type="button"
                className="w6w-btn"
                disabled={disabled}
                onClick={() => apply(pending, false)}
              >
                Only this node
              </button>
            </div>
          </Modal>,
          portalHost,
        )}
    </>
  );
}
