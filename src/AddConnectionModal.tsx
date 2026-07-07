import { useEffect, useState } from "react";
import { AppIcon } from "./components/AppIcon.tsx";
import { AuthFieldsForm } from "./components/AuthFieldsForm.tsx";
import { Modal } from "./components/Modal.tsx";
import { startOAuthPopup } from "./oauth-popup.ts";
import { useW6wApi } from "./provider.tsx";
import type { AppSummary, AuthDef, AuthField, ThemeMode } from "./types.ts";

export interface AddConnectionModalProps {
  onClose: () => void;
  /** Fired after a successful create (both API-key and OAuth paths). */
  onCreated: (result: { connectionId: string }) => void;
  /** Optional theme hint passed through to `AppIcon` (light/dark variant). */
  theme?: ThemeMode;
  /**
   * Pre-select an app and hide the app picker — used when the modal is opened
   * for a specific app (e.g. from the step builder). Omit to let the user pick.
   */
  initialAppId?: string;
}

/**
 * Add-connection modal: pick an app → pick an auth method → fill in the fields
 * (or run OAuth) → submit. The `AuthDef.fields` array drives the form so no
 * app-specific knowledge is hard-coded.
 *
 * Data + IO come from `useW6wApi()` — wrap the app in `<W6wUIProvider api={...}>`
 * once and this component (and everything else in @w6w/ui) uses that client.
 */
export function AddConnectionModal(props: AddConnectionModalProps) {
  const api = useW6wApi();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string>(props.initialAppId ?? "");
  const [authKey, setAuthKey] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [credential, setCredential] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Per-app auth methods cache — keeps changes to the app dropdown snappy.
  const [authByApp, setAuthByApp] = useState<Record<string, AuthDef[]>>({});
  const [loadingAuth, setLoadingAuth] = useState(false);

  // Fetch the app list once when the modal mounts. Consumers that want
  // cross-modal caching wrap their W6wApi implementation with react-query/SWR.
  useEffect(() => {
    let canceled = false;
    api
      .listApps()
      .then((r) => {
        if (!canceled) setApps(r);
      })
      .catch((e) => {
        if (!canceled) setAppsError((e as Error).message);
      });
    return () => {
      canceled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!appId) return;
    if (authByApp[appId]) return;
    let canceled = false;
    setLoadingAuth(true);
    api
      .getAppAuth(appId)
      .then((auths) => {
        if (canceled) return;
        setAuthByApp((prev) => ({ ...prev, [appId]: auths }));
      })
      .catch((e) => {
        if (canceled) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (!canceled) setLoadingAuth(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, appId, authByApp]);

  const selectedApp: AppSummary | undefined = (apps ?? []).find((a) => a.id === appId);
  // Hide methods the server flagged unavailable (e.g. oauth2 with no host creds).
  const auths: AuthDef[] = (authByApp[appId] ?? []).filter((a) => a.available !== false);
  const auth: AuthDef | undefined = auths.find((a) => a.key === authKey) ?? auths[0];
  const fields: AuthField[] = auth?.fields ?? [];

  if (auth && !authKey) setAuthKey(auth.key);

  const isOAuth = auth?.type === "oauth2";
  const requiredMissing =
    !isOAuth &&
    fields.some((f) => f.required && (credential[f.key] === undefined || credential[f.key] === ""));

  async function submit() {
    if (!auth) return;
    setError(null);
    setPending(true);
    try {
      if (isOAuth) {
        const { authorizationUrl } = await api.startAppOAuthFlow(appId, auth.key, {
          displayName: displayName || undefined,
        });
        const { connectionId } = await startOAuthPopup(authorizationUrl);
        props.onCreated({ connectionId });
      } else {
        const conn = await api.createConnection(appId, {
          authKey: auth.key,
          credential,
          displayName: displayName || undefined,
        });
        props.onCreated({ connectionId: conn.id });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Add connection" onClose={props.onClose}>
      {appsError && <div className="w6w-result w6w-error">{appsError}</div>}
      {!appsError && apps === null && <p className="w6w-muted w6w-small">Loading apps…</p>}

      {apps !== null && !props.initialAppId && (
        <label className="w6w-field">
          <span>App</span>
          <select
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value);
              setAuthKey("");
              setCredential({});
              setError(null);
            }}
          >
            <option value="">— pick an app —</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.id})
              </option>
            ))}
          </select>
        </label>
      )}

      {appId && loadingAuth && <p className="w6w-muted w6w-small">Loading auth methods…</p>}

      {appId && !loadingAuth && auths.length === 0 && (
        <p className="w6w-muted w6w-small">
          This app has no available auth methods. If it uses OAuth, its client credentials may not
          be configured on the server yet.
        </p>
      )}

      {appId && auths.length > 1 && (
        <label className="w6w-field">
          <span>Auth method</span>
          <select value={authKey} onChange={(e) => setAuthKey(e.target.value)}>
            {auths.map((a) => (
              <option key={a.key} value={a.key}>
                {a.displayName ?? a.key} ({a.type})
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedApp && (
        <div className="w6w-app-summary">
          <AppIcon
            src={selectedApp.iconSvg}
            srcDark={selectedApp.iconSvgDark}
            brandColor={selectedApp.brandColor}
            name={selectedApp.displayName}
            theme={props.theme}
          />
          <div>
            <strong>{selectedApp.displayName}</strong>
            <div className="w6w-muted w6w-small">
              <code>{selectedApp.id}</code>
            </div>
          </div>
        </div>
      )}

      {auth && (
        <>
          <label className="w6w-field">
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Production API key"
            />
          </label>
          {auth.description && <p className="w6w-muted w6w-small">{auth.description}</p>}
          {isOAuth ? (
            <p className="w6w-muted w6w-small">
              You'll be redirected to <strong>{auth.displayName ?? auth.key}</strong> to authorize
              this connection.
            </p>
          ) : (
            <AuthFieldsForm fields={fields} values={credential} onChange={setCredential} />
          )}
        </>
      )}

      {error && <div className="w6w-result w6w-error">{error}</div>}

      <div className="w6w-modal-actions">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="w6w-btn"
          disabled={!auth || (!isOAuth && requiredMissing) || pending}
          onClick={submit}
        >
          {pending
            ? isOAuth
              ? "Waiting for authorization…"
              : "Saving…"
            : isOAuth
              ? `Sign in with ${auth?.displayName ?? auth?.key ?? "provider"}`
              : "Save connection"}
        </button>
      </div>
    </Modal>
  );
}
