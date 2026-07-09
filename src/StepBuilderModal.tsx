import { useEffect, useState } from "react";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import { CONTROL_APP, CONTROL_LABELS, CONTROL_PARAMS, controlDefaults } from "./flow-types.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionDef, AppSummary, AuthDef, ConnectionSummary, ThemeMode } from "./types.ts";

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

type Tab = "connected" | "apps" | "controls";

/**
 * Guided "add a step" flow. A sidebar toggles between **Apps** (pick app →
 * ensure a connection → pick action → fill params) and **Flow controls**
 * (if / for-each / parallel / wait). Emits a `BuiltStep` via `onAdd`.
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
  // Same collapse for a chosen flow control — its config form (dynamic
  // ParamsForm over CONTROL_PARAMS) shows before the step is added.
  const [selectedControl, setSelectedControl] = useState<string | null>(null);

  if (selectedControl) {
    return (
      <Modal
        title={CONTROL_LABELS[selectedControl] ?? selectedControl}
        subtitle={<code>{selectedControl}</code>}
        onClose={onClose}
        size="xl"
        headerRight={
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            onClick={() => setSelectedControl(null)}
          >
            ← Controls
          </button>
        }
      >
        <div className="w6w-stepbuilder-content">
          <ControlStepConfig action={selectedControl} onAdd={onAdd} onClose={onClose} />
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
            Flow controls
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
            <AppsFlow onSelectApp={setSelectedApp} theme={theme} />
          ) : (
            <ControlsFlow onSelect={setSelectedControl} />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Flow controls tab ─────────────────────────────────────────────────────

function ControlsFlow({ onSelect }: { onSelect: (action: string) => void }) {
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Flow controls branch, loop, parallelize, pause, run a script, or declare data.
      </p>
      <div className="w6w-stepbuilder-list">
        {Object.entries(CONTROL_LABELS).map(([action, label]) => (
          <button
            key={action}
            type="button"
            className="w6w-stepbuilder-item"
            onClick={() => onSelect(action)}
          >
            <strong>{label}</strong>
            <code className="w6w-muted w6w-small">{action}</code>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Config form for a chosen flow control — the control's `CONTROL_PARAMS` schema
 * rendered through the same `ParamsForm` as app actions, seeded with the
 * control's defaults. Emits the built control step on Add.
 */
function ControlStepConfig({
  action,
  onAdd,
  onClose,
}: {
  action: string;
  onAdd: (s: BuiltStep) => void;
  onClose: () => void;
}) {
  const params = CONTROL_PARAMS[action] ?? [];
  const [withValues, setWithValues] = useState<Record<string, unknown>>(() =>
    controlDefaults(action),
  );

  return (
    <div className="w6w-stack">
      <div>
        <div className="w6w-muted w6w-small" style={{ marginBottom: 6 }}>
          Configuration
        </div>
        <ParamsForm params={params} values={withValues} onChange={setWithValues} />
      </div>
      <div className="w6w-modal-actions">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="w6w-btn"
          onClick={() => onAdd({ uses: { app: CONTROL_APP, action }, with: withValues })}
        >
          Add step
        </button>
      </div>
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
    .filter((a) => connectedIds.has(a.id))
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

// ── Apps tab ───────────────────────────────────────────────────────────────

function AppsFlow({
  onSelectApp,
  theme,
}: {
  onSelectApp: (app: AppSummary) => void;
  theme?: ThemeMode;
}) {
  const api = useW6wApi();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let canceled = false;
    api
      .listApps()
      .then((r) => !canceled && setApps(r))
      .catch((e) => !canceled && setAppsError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api]);

  if (appsError) return <div className="w6w-result w6w-error">{appsError}</div>;
  if (apps === null) return <p className="w6w-muted w6w-small">Loading apps…</p>;
  if (apps.length === 0) {
    return (
      <p className="w6w-muted w6w-small">
        No apps registered yet. Register one from the Apps page first.
      </p>
    );
  }

  // Alphabetical by display name, then filtered by the search box (name or id).
  const q = query.trim().toLowerCase();
  const sorted = [...apps].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
  const visible = q
    ? sorted.filter(
        (a) => a.displayName.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
      )
    : sorted;

  return (
    <div className="w6w-stepbuilder-apps">
      <input
        type="text"
        className="w6w-stepbuilder-search"
        placeholder="Search apps…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search apps"
      />
      {visible.length === 0 ? (
        <p className="w6w-muted w6w-small">No apps match “{query}”.</p>
      ) : (
        <div className="w6w-stepbuilder-list w6w-stepbuilder-scroll">
          {visible.map((a) => (
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
      )}
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
    <div className="w6w-stack">
      {metaError && <div className="w6w-result w6w-error">{metaError}</div>}
      {auths === null && !metaError && <p className="w6w-muted w6w-small">Loading…</p>}

      {/* Connection */}
      {auths !== null &&
        needsConnection &&
        (!hasConnection ? (
          <div className="w6w-result">
            <div style={{ marginBottom: 8 }}>
              This app needs a connection before its actions can run.
            </div>
            <button type="button" className="w6w-btn" onClick={() => setShowConnModal(true)}>
              Create connection
            </button>
          </div>
        ) : (
          <label className="w6w-field">
            <span>Connection</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
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
        ))}

      {/* Actions */}
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

      {/* Params */}
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

      <div className="w6w-modal-actions">
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
            await refetchConns();
          }}
        />
      )}
    </div>
  );
}
