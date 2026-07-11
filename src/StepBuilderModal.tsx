import { type ReactNode, useEffect, useState } from "react";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { AppPicker } from "./AppPicker.tsx";
import { JsonEditor } from "./JsonEditor.tsx";
import { type NodeConfig, NodeConfigForm } from "./NodeConfigForm.tsx";
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

/** The step the builder emits — the editor assigns the final `id`. `NodeConfig`
 * carries the base settings (retry / onError / notes) set on the Config view. */
export interface BuiltStep extends NodeConfig {
  uses: { app: string; action: string; connection?: string | null };
  with?: Record<string, unknown>;
}

export interface StepBuilderModalProps {
  onClose: () => void;
  /** Fired when the user confirms a step to add. */
  onAdd: (step: BuiltStep) => void;
  theme?: ThemeMode;
}

type Tab = "connected" | "apps" | "triggers" | "controls" | "utilities";

/** Config sub-tabs shared by the add-step config and the node editor. */
type StepConfigTab = "setup" | "configure" | "test";

/** The three representations of the Configure tab: form, raw JSON, node settings. */
export type ConfigView = "props" | "code" | "config";

/** A 15×15 stroked glyph on a 24×24 viewBox (matches the editor's toolbar icons). */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * The props / code / config view toggle, right-aligned in the tabs bar. Disabled
 * off the Configure tab (the three views all represent the action's config).
 */
export function ConfigViewToggle({
  view,
  onChange,
  disabled,
}: {
  view: ConfigView;
  onChange: (v: ConfigView) => void;
  disabled?: boolean;
}) {
  const btn = (v: ConfigView, label: string, glyph: ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={view === v}
      disabled={disabled}
      className={`w6w-icon-btn${view === v && !disabled ? " active" : ""}`}
      onClick={() => onChange(v)}
    >
      <Glyph>{glyph}</Glyph>
    </button>
  );
  return (
    <div className="w6w-view-toggle">
      {btn(
        "props",
        "Form",
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="7" y1="8" x2="17" y2="8" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="7" y1="16" x2="13" y2="16" />
        </>,
      )}
      {btn(
        "code",
        "JSON",
        <>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </>,
      )}
      {btn(
        "config",
        "Node settings",
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>,
      )}
    </div>
  );
}

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
        <div className="w6w-stepbuilder-config">
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
      >
        <div className="w6w-stepbuilder-config">
          {/* App-switching lives in the Setup tab's "Change" (à la Zapier), not a
              top-right back button. */}
          <AppStepConfig
            appId={selectedApp.id}
            app={selectedApp}
            onAdd={onAdd}
            onClose={onClose}
            onChangeApp={() => setSelectedApp(null)}
            theme={theme}
          />
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
            className={`w6w-stepbuilder-tab${tab === "triggers" ? " active" : ""}`}
            onClick={() => setTab("triggers")}
          >
            Triggers
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
          ) : tab === "triggers" ? (
            <TriggersFlow onSelect={setSelectedNode} />
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

/** Triggers tab — entry nodes that start a workflow (manual, webhook, …). */
function TriggersFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group === "trigger");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Triggers start a workflow — run it manually or on an inbound webhook.
      </p>
      <NodeList nodes={nodes} onSelect={onSelect} />
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

/** Utilities tab — compute + request nodes (script, data, HTTP, respond). */
function UtilitiesFlow({ onSelect }: { onSelect: (node: InternalNodeDef) => void }) {
  const nodes = INTERNAL_NODES.filter((n) => n.group !== "control" && n.group !== "trigger");
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Utilities run a script, call an HTTP(S) endpoint, declare data, or respond to a webhook.
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
  // Internal nodes have no connection/action to pick, so there's no Setup tab —
  // just Configure + Test (flow-control nodes aren't testable standalone).
  const testable = !isControlApp(node.app);
  const [tab, setTab] = useState<"configure" | "test">("configure");
  const [configView, setConfigView] = useState<ConfigView>("props");
  const [codeText, setCodeText] = useState("{}");
  const [draftConfig, setDraftConfig] = useState<NodeConfig>({});
  const configComplete = requiredParamsFilled(node.params, withValues);

  const changeConfigView = (v: ConfigView) => {
    if (v === "code") setCodeText(JSON.stringify(withValues, null, 2));
    setConfigView(v);
  };
  const add = () =>
    onAdd({ uses: { app: node.app, action: node.action }, with: withValues, ...draftConfig });

  return (
    <div className="w6w-stepconfig">
      <div className="w6w-tabsbar">
        <div className="w6w-subtabs">
          <button
            type="button"
            className={`w6w-subtab${tab === "configure" ? " active" : ""}`}
            onClick={() => setTab("configure")}
          >
            Configure
          </button>
          {testable && (
            <button
              type="button"
              disabled={!configComplete}
              title={configComplete ? undefined : "Fill the required fields first"}
              className={`w6w-subtab${tab === "test" ? " active" : ""}`}
              onClick={() => configComplete && setTab("test")}
            >
              Test
            </button>
          )}
        </div>
        <ConfigViewToggle
          view={configView}
          onChange={changeConfigView}
          disabled={tab !== "configure"}
        />
      </div>

      <div className="w6w-stepconfig-body">
        {tab === "configure" &&
          (configView === "props" ? (
            <ParamsForm params={node.params} values={withValues} onChange={setWithValues} />
          ) : configView === "code" ? (
            <JsonEditor
              value={codeText}
              onChange={setCodeText}
              minHeight="240px"
              aria-label="Parameters JSON"
              onValidChange={(p) =>
                p &&
                typeof p === "object" &&
                !Array.isArray(p) &&
                setWithValues(p as Record<string, unknown>)
              }
            />
          ) : (
            <NodeConfigForm config={draftConfig} onChange={setDraftConfig} />
          ))}
        {tab === "test" && testable && (
          <StepTestRun
            app={node.app}
            action={node.action}
            values={withValues}
            canRun={configComplete}
          />
        )}
      </div>

      {/* Footer — pinned to the modal bottom, outside the scroll area. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {tab === "configure" && testable ? (
          <button
            type="button"
            className="w6w-btn"
            disabled={!configComplete}
            onClick={() => setTab("test")}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="w6w-btn" onClick={add}>
            Add step
          </button>
        )}
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
        <div className="w6w-testout">
          <div className="w6w-testout-label">Result (return value)</div>
          <pre
            className="w6w-result"
            style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0 }}
          >
            {JSON.stringify(state.value, null, 2)}
          </pre>
        </div>
      )}
      {logs && logs.length > 0 && (
        <div className="w6w-testout">
          <div className="w6w-testout-label">Console output</div>
          <pre
            className="w6w-result w6w-testout-console"
            style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}
          >
            {logs.join("\n")}
          </pre>
        </div>
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
  app,
  onAdd,
  onClose,
  onChangeApp,
  theme,
}: {
  appId: string;
  app?: AppSummary;
  onAdd: (s: BuiltStep) => void;
  onClose: () => void;
  onChangeApp?: () => void;
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
  // Setup (app + connection + action) / Configure (params) / Test — same tabs as
  // the node editor, so add + edit are consistent.
  const [tab, setTab] = useState<StepConfigTab>("setup");
  // The Configure tab's three representations (form / JSON / node settings).
  const [configView, setConfigView] = useState<ConfigView>("props");
  // Draft text backing the JSON ("code") view of the params.
  const [codeText, setCodeText] = useState("{}");
  // Base node settings (retry / onError / notes) set on the Config view.
  const [draftConfig, setDraftConfig] = useState<NodeConfig>({});

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
  // Setup is done when an action is picked and its connection (if any) is set;
  // Configure is done when the action's required params are filled.
  const setupComplete = !!actionKey && connectionSatisfied;
  const configComplete =
    setupComplete &&
    !!selectedAction &&
    requiredParamsFilled(selectedAction.params ?? [], withValues);
  const canAdd = setupComplete;

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
      ...draftConfig,
    });
  }

  const changeConfigView = (v: ConfigView) => {
    if (v === "code") setCodeText(JSON.stringify(withValues, null, 2));
    setConfigView(v);
  };

  return (
    <div className="w6w-stepconfig">
      {/* Tabs bar — full width: Setup/Configure/Test on the left, the props/code/
          config view icons on the right (enabled only on the Configure tab). */}
      <div className="w6w-tabsbar">
        <div className="w6w-subtabs">
          <button
            type="button"
            className={`w6w-subtab${tab === "setup" ? " active" : ""}`}
            onClick={() => setTab("setup")}
          >
            Setup
          </button>
          <button
            type="button"
            disabled={!setupComplete}
            title={setupComplete ? undefined : "Complete Setup first"}
            className={`w6w-subtab${tab === "configure" ? " active" : ""}`}
            onClick={() => setupComplete && setTab("configure")}
          >
            Configure
          </button>
          <button
            type="button"
            disabled={!configComplete}
            title={configComplete ? undefined : "Fill the required fields first"}
            className={`w6w-subtab${tab === "test" ? " active" : ""}`}
            onClick={() => configComplete && setTab("test")}
          >
            Test
          </button>
        </div>
        <ConfigViewToggle
          view={configView}
          onChange={changeConfigView}
          disabled={tab !== "configure"}
        />
      </div>

      <div className="w6w-stepconfig-body">
        {/* Setup — app, connection, action. */}
        {tab === "setup" && (
          <div className="w6w-stack">
            {metaError && <div className="w6w-result w6w-error">{metaError}</div>}
            {auths === null && !metaError && <p className="w6w-muted w6w-small">Loading…</p>}

            {/* App — click Change to go back to the app picker. */}
            <div className="w6w-field">
              <span>App</span>
              <div className="w6w-conn-label">
                {app && (
                  <AppIcon
                    src={app.iconSvg}
                    srcDark={app.iconSvgDark}
                    brandColor={app.brandColor}
                    name={app.displayName}
                    theme={theme}
                    size={20}
                  />
                )}
                <span className="w6w-conn-label-name">{app?.displayName ?? appId}</span>
                {onChangeApp && (
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost w6w-btn-sm"
                    onClick={onChangeApp}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

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
                <label className="w6w-field">
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
                <div className="w6w-field">
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

            {/* Action */}
            {actions !== null &&
              (actions.length === 0 ? (
                <p className="w6w-muted w6w-small">This app exposes no actions.</p>
              ) : (
                <label className="w6w-field">
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
        )}

        {/* Configure — the action's config, as a form (props), raw JSON (code),
            or the base node settings (config). */}
        {tab === "configure" &&
          (!selectedAction ? (
            <p className="w6w-muted w6w-small">Pick an action in Setup first.</p>
          ) : configView === "props" ? (
            <ParamsForm
              params={selectedAction.params ?? []}
              values={withValues}
              onChange={setWithValues}
            />
          ) : configView === "code" ? (
            <JsonEditor
              value={codeText}
              onChange={setCodeText}
              minHeight="240px"
              aria-label="Parameters JSON"
              onValidChange={(p) =>
                p &&
                typeof p === "object" &&
                !Array.isArray(p) &&
                setWithValues(p as Record<string, unknown>)
              }
            />
          ) : (
            <NodeConfigForm config={draftConfig} onChange={setDraftConfig} />
          ))}

        {/* Test — try the action with the current params. */}
        {tab === "test" &&
          (selectedAction ? (
            <StepTestRun
              app={appId}
              action={selectedAction.key}
              connectionId={needsConnection && connectionId ? connectionId : undefined}
              values={withValues}
              canRun={canAdd && requiredParamsFilled(selectedAction.params ?? [], withValues)}
            />
          ) : (
            <p className="w6w-muted w6w-small">Pick an action in Setup first.</p>
          ))}
      </div>

      {/* Footer — pinned to the modal bottom. Each tab has a Next button; the
          last (Test) commits the step. */}
      <div className="w6w-modal-actions w6w-stepconfig-footer">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {tab === "test" ? (
          <button type="button" className="w6w-btn" disabled={!canAdd} onClick={add}>
            Add step
          </button>
        ) : (
          <button
            type="button"
            className="w6w-btn"
            disabled={tab === "setup" ? !setupComplete : !configComplete}
            onClick={() => setTab(tab === "setup" ? "configure" : "test")}
          >
            Next →
          </button>
        )}
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
