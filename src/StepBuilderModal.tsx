import { useEffect, useState } from "react";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { AppPicker } from "./AppPicker.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import {
  INTERNAL_NODES,
  type InternalNodeDef,
  internalNodeDefaults,
  isControlApp,
  isInternalApp,
} from "./flow-types.ts";
import { useW6wApi } from "./provider.tsx";
import type {
  ActionDef,
  ActionParam,
  AppSummary,
  AuthDef,
  ConnectionSummary,
  ThemeMode,
} from "./types.ts";

/** The step the builder emits — the editor assigns the final `id`. */
export interface BuiltStep {
  uses: { app: string; action: string; connection?: string | null };
  with?: Record<string, unknown>;
}

export interface StepBuilderModalProps {
  onClose: () => void;
  /** Fired when the user confirms a step to add. */
  onAdd: (step: BuiltStep) => void;
  theme?: ThemeMode;
}

type Tab = "connected" | "apps" | "controls" | "utilities";

/**
 * Guided "add a step" flow. A sidebar toggles between **Apps** (pick app →
 * ensure a connection → pick action → fill params) and **Controls** — the
 * internal nodes: triggers, flow control (if/foreach/parallel/wait), and compute
 * (script/data). Emits a `BuiltStep` via `onAdd`.
 *
 * Data + IO come from `useW6wApi()`, so mount it under `<W6wUIProvider>`.
 */
export function StepBuilderModal({ onClose, onAdd, theme }: StepBuilderModalProps) {
  // Default to the apps the user already connected — no searching for the one
  // integration they use every day.
  const [tab, setTab] = useState<Tab>("connected");
  // When an app is selected the modal collapses to a single-app detail view:
  // the sidebar is hidden and the header switches to the app's name + icon.
  const [selectedApp, setSelectedApp] = useState<AppSummary | null>(null);
  // Same collapse for a chosen internal node (trigger / control / compute) — its
  // config form (dynamic ParamsForm over the node's schema) shows before adding.
  const [selectedNode, setSelectedNode] = useState<InternalNodeDef | null>(null);

  if (selectedNode) {
    return (
      <Modal
        title={selectedNode.label}
        subtitle={
          <code>
            {selectedNode.app} · {selectedNode.action}
          </code>
        }
        onClose={onClose}
        size="xl"
        headerRight={
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            onClick={() => setSelectedNode(null)}
          >
            ← Back
          </button>
        }
      >
        <div className="w6w-stepbuilder-content">
          <ControlStepConfig node={selectedNode} onAdd={onAdd} onClose={onClose} />
        </div>
      </Modal>
    );
  }

  if (selectedApp) {
    return (
      <Modal
        title={selectedApp.displayName}
        subtitle={
          <>
            <code>{selectedApp.id}</code>
            {selectedApp.version && ` · v${selectedApp.version}`}
          </>
        }
        onClose={onClose}
        size="xl"
        titleIcon={
          <AppIcon
            src={selectedApp.iconSvg}
            srcDark={selectedApp.iconSvgDark}
            brandColor={selectedApp.brandColor}
            name={selectedApp.displayName}
            theme={theme}
            size={22}
          />
        }
        headerRight={
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            onClick={() => setSelectedApp(null)}
          >
            ← Apps
          </button>
        }
      >
        <div className="w6w-stepbuilder-content">
          <AppStepConfig appId={selectedApp.id} onAdd={onAdd} onClose={onClose} theme={theme} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a step" onClose={onClose} size="xl">
      <div className="w6w-stepbuilder">
        <nav className="w6w-stepbuilder-sidebar">
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "connected" ? " active" : ""}`}
            onClick={() => setTab("connected")}
          >
            Connected apps
          </button>
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "apps" ? " active" : ""}`}
            onClick={() => setTab("apps")}
          >
            Apps
          </button>
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "controls" ? " active" : ""}`}
            onClick={() => setTab("controls")}
          >
            Controls
          </button>
          <button
            type="button"
            className={`w6w-stepbuilder-tab${tab === "utilities" ? " active" : ""}`}
            onClick={() => setTab("utilities")}
          >
            Utilities
          </button>
        </nav>
        <div className="w6w-stepbuilder-content">
          {tab === "connected" ? (
            <ConnectedAppsFlow
              onSelectApp={setSelectedApp}
              onBrowseAll={() => setTab("apps")}
              theme={theme}
            />
          ) : tab === "apps" ? (
            <AppPicker onSelectApp={setSelectedApp} theme={theme} />
          ) : tab === "controls" ? (
            <ControlsFlow onSelect={setSelectedNode} />
          ) : (
            <UtilitiesFlow onSelect={setSelectedNode} />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Internal nodes tab (triggers, flow control, compute) ───────────────────

/** A flat, clickable list of internal nodes. Shared by Controls + Utilities. */
function NodeList({
  nodes,
  onSelect,
}: {
  nodes: InternalNodeDef[];
  onSelect: (node: InternalNodeDef) => void;
}) {
  return (
    <div className="w6w-stepbuilder-list">
      {nodes.map((n) => (
        <button
          key={`${n.app}:${n.action}`}
          type="button"
          className="w6w-stepbuilder-item"
          onClick={() => onSelect(n)}
        >
          <strong>{n.label}</strong>
          <code className="w6w-muted w6w-small">
            {n.app} · {n.action}
          </code>
        </button>
      ))}
    </div>
  );
}

/** Controls tab — engine-native flow control only (branch, loop, parallelize, wait). */
function ControlsFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group === "control");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Flow-control nodes branch, loop, parallelize, or pause the run.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/** Utilities tab — everything else: run a script, call HTTP(S), declare data, or trigger. */
function UtilitiesFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group !== "control");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Utilities run a script, call an HTTP(S) endpoint, declare data, or trigger the workflow.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

/**
 * Config form for a chosen internal node — its schema rendered through the same
 * `ParamsForm` as app actions, seeded with the node's defaults. Emits the built
 * step on Add.
 */
function ControlStepConfig({
  node,
  onAdd,
  onClose,
}: {
  node: InternalNodeDef;
  onAdd: (s: BuiltStep) => void;
  onClose: () => void;
}) {
  const [withValues, setWithValues] = useState<Record<string, unknown>>(() =>
    internalNodeDefaults(node.app, node.action),
  );

  return (
    <div className="w6w-stepconfig">
      {/* Configuration — the only scrolling region. */}
      <div className="w6w-stepconfig-body">
        <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
          Configuration
        </div>
        <ParamsForm params={node.params} values={withValues} onChange={setWithValues} />
      </div>
      {/* Flow-control nodes can't run standalone (they need traversal context);
          everything else (script/data/http/trigger) is testable in place. */}
      {!isControlApp(node.app) && (
        <StepTestRun
          app={node.app}
          action={node.action}
          values={withValues}
          canRun={requiredParamsFilled(node.params, withValues)}
        />
      )}
      {/* Footer — pinned to the modal bottom, outside the scroll area. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="w6w-btn"
          onClick={() => onAdd({ uses: { app: node.app, action: node.action }, with: withValues })}
        >
          Add step
        </button>
      </div>
    </div>
  );
}

/**
 * Whether every required param has a usable value — gates the inline "Test run".
 * A required array (e.g. a `vars` table) may be empty (see the Data node); other
 * required fields must be non-empty.
 */
export function requiredParamsFilled(
  params: ActionParam[],
  values: Record<string, unknown>,
): boolean {
  return params
    .filter((p) => p.required)
    .every((p) => {
      const v = values[p.key] ?? p.default;
      if (v === undefined || v === null) return false;
      if (typeof v === "string") return v.trim() !== "";
      return true;
    });
}

type TestState =
  | { status: "running" }
  | { status: "done"; value: unknown; logs?: string[] }
  | { status: "error"; error: string; errorCode?: string; logs?: string[] };

/**
 * Inline "Test run" — invokes the action/node with the current params (and, for
 * app actions, the chosen connection) so the user can try a step from inside the
 * builder before adding it. Pressable only once required fields are filled.
 */
export function StepTestRun({
  app,
  action,
  connectionId,
  values,
  canRun,
}: {
  app: string;
  action: string;
  connectionId?: string;
  values: Record<string, unknown>;
  canRun: boolean;
}) {
  const api = useW6wApi();
  const [state, setState] = useState<TestState | null>(null);

  const run = async () => {
    setState({ status: "running" });
    try {
      const result = await api.invokeAction(
        app,
        action,
        values,
        connectionId ? { connectionId } : {},
      );
      setState({
        status: "done",
        value: result.value,
        logs: (result as { logs?: string[] }).logs,
      });
    } catch (e) {
      const err = e as { message?: string; code?: string; logs?: string[] };
      setState({
        status: "error",
        error: err.message ?? String(e),
        errorCode: err.code,
        logs: err.logs,
      });
    }
  };

  const logs = state && state.status !== "running" ? state.logs : undefined;

  return (
    <div className="w6w-steptest">
      <div className="w6w-steptest-bar">
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost"
          disabled={!canRun || state?.status === "running"}
          onClick={run}
        >
          {state?.status === "running" ? "Running…" : "▶ Test run"}
        </button>
        {!canRun && <span className="w6w-muted w6w-small">Fill the required fields to test.</span>}
      </div>
      {state?.status === "error" && (
        <div className="w6w-result w6w-error">
          {state.errorCode && (
            <div className="w6w-small" style={{ opacity: 0.75, marginBottom: 4 }}>
              <code>{state.errorCode}</code>
            </div>
          )}
          {state.error}
        </div>
      )}
      {state?.status === "done" && (
        <pre
          className="w6w-result"
          style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0 }}
        >
          {JSON.stringify(state.value, null, 2)}
        </pre>
      )}
      {logs && logs.length > 0 && (
        <pre
          className="w6w-result"
          style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}
        >
          {logs.join("\n")}
        </pre>
      )}
    </div>
  );
}

// ── Connected apps tab (default) ─────────────────────────────────────────────

function ConnectedAppsFlow({
  onSelectApp,
  onBrowseAll,
  theme,
}: {
  onSelectApp: (app: AppSummary) => void;
  onBrowseAll: () => void;
  theme?: ThemeMode;
}) {
  const api = useW6wApi();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    Promise.all([api.listApps(), api.listConnections()])
      .then(([allApps, conns]) => {
        if (canceled) return;
        setApps(allApps);
        setConnectedIds(new Set(conns.map((c) => c.appId)));
      })
      .catch((e) => !canceled && setError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api]);

  if (error) return <div className="w6w-result w6w-error">{error}</div>;
  if (apps === null || connectedIds === null) {
    return <p className="w6w-muted w6w-small">Loading…</p>;
  }

  const connected = apps
    // Reserved `@w6w/*` pseudo-apps have no connections; filter them defensively
    // so they can never surface here even if one slips into the app list.
    .filter((a) => connectedIds.has(a.id) && !isInternalApp(a.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

  if (connected.length === 0) {
    return (
      <div className="w6w-stack">
        <p className="w6w-muted w6w-small">
          No connected apps yet. Browse all apps to add your first connection.
        </p>
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onBrowseAll}>
          Browse all apps
        </button>
      </div>
    );
  }

  return (
    <div className="w6w-stepbuilder-apps">
      <div className="w6w-stepbuilder-list w6w-stepbuilder-scroll">
        {connected.map((a) => (
          <button
            key={a.id}
            type="button"
            className="w6w-stepbuilder-item"
            onClick={() => onSelectApp(a)}
          >
            <AppIcon
              src={a.iconSvg}
              srcDark={a.iconSvgDark}
              brandColor={a.brandColor}
              name={a.displayName}
              theme={theme}
              size={24}
            />
            <span className="w6w-stepbuilder-item-main">
              <strong>{a.displayName}</strong>
              <code className="w6w-muted w6w-small">{a.id}</code>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AppStepConfig({
  appId,
  onAdd,
  onClose,
  theme,
}: {
  appId: string;
  onAdd: (s: BuiltStep) => void;
  onClose: () => void;
  theme?: ThemeMode;
}) {
  const api = useW6wApi();
  const [auths, setAuths] = useState<AuthDef[] | null>(null);
  const [conns, setConns] = useState<ConnectionSummary[] | null>(null);
  const [actions, setActions] = useState<ActionDef[] | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [connectionId, setConnectionId] = useState<string>("");
  const [actionKey, setActionKey] = useState<string>("");
  const [withValues, setWithValues] = useState<Record<string, unknown>>({});
  const [showConnModal, setShowConnModal] = useState(false);
  // Once a connection is chosen it renders as a static label; "Change" flips
  // back to the dropdown. No connection selected yet also forces the dropdown.
  const [changingConn, setChangingConn] = useState(false);

  // Load auth methods, existing connections, and actions for the app in parallel.
  useEffect(() => {
    let canceled = false;
    setMetaError(null);
    Promise.all([api.getAppAuth(appId), api.listConnectionsForApp(appId), api.getAppActions(appId)])
      .then(([au, co, ac]) => {
        if (canceled) return;
        setAuths(au);
        setConns(co);
        setActions(ac);
        if (co.length > 0) setConnectionId(co[0].id);
      })
      .catch((e) => !canceled && setMetaError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, appId]);

  const refetchConns = async () => {
    const co = await api.listConnectionsForApp(appId);
    setConns(co);
    if (co.length > 0) setConnectionId((prev) => prev || co[0].id);
  };

  const availableAuths = (auths ?? []).filter((a) => a.available !== false);
  const needsConnection = availableAuths.length > 0;
  const hasConnection = (conns ?? []).length > 0;
  const selectedAction = (actions ?? []).find((a) => a.key === actionKey);
  // Alphabetical by display title (falling back to key) so the dropdown is
  // scannable regardless of the manifest's declaration order.
  const sortedActions = [...(actions ?? [])].sort((a, b) =>
    (a.title ?? a.key).localeCompare(b.title ?? b.key, undefined, { sensitivity: "base" }),
  );

  const connectionSatisfied = !needsConnection || (hasConnection && !!connectionId);
  const canAdd = !!actionKey && connectionSatisfied;

  const selectedConn = (conns ?? []).find((c) => c.id === connectionId);
  // Show the dropdown only before a connection is picked or while changing it;
  // otherwise the selected connection reads as a compact label.
  const showConnPicker = changingConn || !connectionId;

  function add() {
    if (!selectedAction) return;
    onAdd({
      uses: {
        app: appId,
        action: selectedAction.key,
        ...(needsConnection && connectionId ? { connection: connectionId } : {}),
      },
      with: withValues,
    });
  }

  return (
    <div className="w6w-stepconfig">
      {/* Fixed header — connection + action never scroll with the params form. */}
      <div className="w6w-stepconfig-header">
        {metaError && <div className="w6w-result w6w-error">{metaError}</div>}
        {auths === null && !metaError && <p className="w6w-muted w6w-small">Loading…</p>}

        <div className="w6w-stepconfig-row">
          {/* Connection */}
          {auths !== null &&
            needsConnection &&
            (!hasConnection ? (
              <div className="w6w-result w6w-stepconfig-conn-empty">
                <div style={{ marginBottom: 8 }}>
                  This app needs a connection before its actions can run.
                </div>
                <button type="button" className="w6w-btn" onClick={() => setShowConnModal(true)}>
                  Create connection
                </button>
              </div>
            ) : showConnPicker ? (
              <label className="w6w-field w6w-stepconfig-conn">
                <span>Connection</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={connectionId}
                    onChange={(e) => {
                      setConnectionId(e.target.value);
                      setChangingConn(false);
                    }}
                    style={{ flex: 1 }}
                  >
                    {(conns ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName || c.id} {c.state ? `(${c.state})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost"
                    onClick={() => setShowConnModal(true)}
                  >
                    + New
                  </button>
                </div>
              </label>
            ) : (
              <div className="w6w-field w6w-stepconfig-conn">
                <span>Connection</span>
                <div className="w6w-conn-label">
                  <span className="w6w-conn-label-name">
                    {selectedConn?.displayName || selectedConn?.id || connectionId}
                    {selectedConn?.state ? ` (${selectedConn.state})` : ""}
                  </span>
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                    onClick={() => setChangingConn(true)}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                    onClick={() => setShowConnModal(true)}
                  >
                    + New
                  </button>
                </div>
              </div>
            ))}

          {/* Actions */}
          {actions !== null &&
            (actions.length === 0 ? (
              <p className="w6w-muted w6w-small">This app exposes no actions.</p>
            ) : (
              <label className="w6w-field w6w-stepconfig-action">
                <span>Action{actionKey ? "" : " *"}</span>
                <select
                  value={actionKey}
                  onChange={(e) => {
                    setActionKey(e.target.value);
                    setWithValues({});
                  }}
                >
                  <option value="">— pick an action —</option>
                  {sortedActions.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.title ?? a.key} ({a.key})
                    </option>
                  ))}
                </select>
                {selectedAction?.description && (
                  <span className="w6w-hint">{selectedAction.description}</span>
                )}
              </label>
            ))}
        </div>
      </div>

      {/* Params — the only scrolling region. */}
      <div className="w6w-stepconfig-body">
        {selectedAction && (
          <div>
            <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
              Parameters
            </div>
            <ParamsForm
              params={selectedAction.params ?? []}
              values={withValues}
              onChange={setWithValues}
            />
          </div>
        )}
      </div>

      {/* Inline test run — available once an action + required params are set. */}
      {selectedAction && (
        <StepTestRun
          app={appId}
          action={selectedAction.key}
          connectionId={needsConnection && connectionId ? connectionId : undefined}
          values={withValues}
          canRun={canAdd && requiredParamsFilled(selectedAction.params ?? [], withValues)}
        />
      )}

      {/* Footer — pinned to the modal bottom, outside the scroll area. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="w6w-btn" disabled={!canAdd} onClick={add}>
          Add step
        </button>
      </div>

      {showConnModal && (
        <AddConnectionModal
          theme={theme}
          initialAppId={appId}
          onClose={() => setShowConnModal(false)}
          onCreated={async ({ connectionId: id }) => {
            setShowConnModal(false);
            setConnectionId(id);
            setChangingConn(false);
            await refetchConns();
          }}
        />
      )}
    </div>
  );
}
