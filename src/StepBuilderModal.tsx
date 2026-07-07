import { useEffect, useState } from "react";
import { AddConnectionModal } from "./AddConnectionModal.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import { Modal } from "./components/Modal.tsx";
import { CONTROL_APP, CONTROL_LABELS } from "./flow-types.ts";
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

type Tab = "apps" | "controls";

/** Default `with` for a freshly added control step. */
const CONTROL_DEFAULTS: Record<string, Record<string, unknown>> = {
  if: { condition: true },
  foreach: { items: [] },
  parallel: {},
  wait: { ms: 1000 },
};

/**
 * Guided "add a step" flow. A sidebar toggles between **Apps** (pick app →
 * ensure a connection → pick action → fill params) and **Flow controls**
 * (if / for-each / parallel / wait). Emits a `BuiltStep` via `onAdd`.
 *
 * Data + IO come from `useW6wApi()`, so mount it under `<W6wUIProvider>`.
 */
export function StepBuilderModal({ onClose, onAdd, theme }: StepBuilderModalProps) {
  const [tab, setTab] = useState<Tab>("apps");

  return (
    <Modal title="Add a step" onClose={onClose} size="wide">
      <div className="w6w-stepbuilder">
        <nav className="w6w-stepbuilder-sidebar">
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
          {tab === "apps" ? (
            <AppsFlow onAdd={onAdd} onClose={onClose} theme={theme} />
          ) : (
            <ControlsFlow onAdd={onAdd} />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Flow controls tab ─────────────────────────────────────────────────────

function ControlsFlow({ onAdd }: { onAdd: (s: BuiltStep) => void }) {
  return (
    <div className="w6w-stack">
      <p className="w6w-muted w6w-small">
        Flow controls branch, loop, parallelize, or pause a workflow.
      </p>
      <div className="w6w-stepbuilder-list">
        {Object.entries(CONTROL_LABELS).map(([action, label]) => (
          <button
            key={action}
            type="button"
            className="w6w-stepbuilder-item"
            onClick={() =>
              onAdd({
                uses: { app: CONTROL_APP, action },
                with: CONTROL_DEFAULTS[action] ?? {},
              })
            }
          >
            <strong>{label}</strong>
            <code className="w6w-muted w6w-small">{action}</code>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Apps tab ───────────────────────────────────────────────────────────────

function AppsFlow({
  onAdd,
  onClose,
  theme,
}: {
  onAdd: (s: BuiltStep) => void;
  onClose: () => void;
  theme?: ThemeMode;
}) {
  const api = useW6wApi();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string>("");

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

  if (!appId) {
    if (apps.length === 0) {
      return (
        <p className="w6w-muted w6w-small">
          No apps registered yet. Register one from the Apps page first.
        </p>
      );
    }
    return (
      <div className="w6w-stepbuilder-list">
        {apps.map((a) => (
          <button
            key={a.id}
            type="button"
            className="w6w-stepbuilder-item"
            onClick={() => setAppId(a.id)}
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
    );
  }

  const app = apps.find((a) => a.id === appId);
  return (
    <AppStepConfig
      app={app}
      appId={appId}
      onBack={() => setAppId("")}
      onAdd={onAdd}
      onClose={onClose}
      theme={theme}
    />
  );
}

function AppStepConfig({
  app,
  appId,
  onBack,
  onAdd,
  onClose,
  theme,
}: {
  app: AppSummary | undefined;
  appId: string;
  onBack: () => void;
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
      <div className="w6w-app-summary">
        <AppIcon
          src={app?.iconSvg}
          srcDark={app?.iconSvgDark}
          brandColor={app?.brandColor}
          name={app?.displayName ?? appId}
          theme={theme}
        />
        <div style={{ flex: 1 }}>
          <strong>{app?.displayName ?? appId}</strong>
          <div className="w6w-muted w6w-small">
            <code>{appId}</code>
          </div>
        </div>
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onBack}>
          ← Apps
        </button>
      </div>

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
              {actions.map((a) => (
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
