import { useEffect, useRef, useState } from "react";
import { AppPicker } from "./AppPicker.tsx";
import { AppIcon } from "./components/AppIcon.tsx";
import { AuthFieldsForm, parseJsonFields } from "./components/AuthFieldsForm.tsx";
import {
  CredentialPicker,
  bindingFieldsFor,
  buildBinding,
} from "./components/CredentialPicker.tsx";
import { Modal } from "./components/Modal.tsx";
import { startOAuthPopup } from "./oauth-popup.ts";
import { useW6WApi } from "./provider.tsx";
import type {
  AppSummary,
  AuthDef,
  AuthField,
  CreateConnectionBody,
  CredentialSummary,
  ThemeMode,
} from "./types.ts";
import { useEnterSubmit } from "./use-enter-submit.ts";

export interface AddConnectionModalProps {
  onClose: () => void;
  /** Fired after a successful create (both API-key and OAuth paths). */
  onCreated: (result: { connectionId: string }) => void;
  /** Optional theme hint passed through to `AppIcon` (light/dark variant). */
  theme?: ThemeMode;
  /**
   * Pre-select an app and skip the picker — used when the modal is opened for a
   * specific app (e.g. from the step builder). Omit to let the user pick.
   */
  initialAppId?: string;
}

/**
 * Add-connection modal. Same shape as the step builder's "add a step" modal —
 * the shared {@link AppPicker} (searchable icon grid) for step one, then the
 * chosen app's connection fields for step two — minus the tabs. Pick an app →
 * pick an auth method → fill the fields (or run OAuth) → submit. The
 * `AuthDef.fields` array drives the form, so no app-specific knowledge is baked
 * in. Data + IO come from `useW6WApi()`.
 */
export function AddConnectionModal(props: AddConnectionModalProps) {
  const api = useW6WApi();
  const [selectedApp, setSelectedApp] = useState<AppSummary | null>(null);
  const [resolvingInitial, setResolvingInitial] = useState<boolean>(Boolean(props.initialAppId));

  // Opened for a specific app: resolve it to an AppSummary (for the header) and
  // go straight to the connection fields, skipping the picker. Prefers the
  // bounded `listAppsByIds([id])` seam (A3) over a full-catalog `listApps()`
  // scan. When `listAppsByIds` exists, its result is final — found resolves to
  // that app, a miss (empty result or rejection) resolves to not-found —
  // `listApps` is NEVER called alongside it: a bounded host's "no such id" is
  // a real answer, not evidence the seam "isn't really implemented" (mirrors
  // AppPicker/useReadyToUse's own no-silent-downgrade rule, T2.1.1 ROUND 2).
  // Only when `listAppsByIds` is itself absent does this fall back to
  // `listApps`-based full-list resolution (today's pre-existing behavior);
  // with neither seam present, it resolves to not-found without ever calling
  // an undefined function.
  useEffect(() => {
    const id = props.initialAppId;
    if (!id) return;
    let canceled = false;
    const finish = (app: AppSummary | null) => {
      if (canceled) return;
      setSelectedApp(app);
      setResolvingInitial(false);
    };
    const listAppsByIds = api.listAppsByIds;
    if (listAppsByIds) {
      listAppsByIds([id])
        .then((apps) => finish(apps.find((a) => a.id === id) ?? null))
        .catch(() => finish(null));
      return () => {
        canceled = true;
      };
    }
    const listApps = api.listApps;
    if (typeof listApps === "function") {
      listApps()
        .then((apps) => finish(apps.find((a) => a.id === id) ?? null))
        .catch(() => finish(null));
    } else {
      finish(null);
    }
    return () => {
      canceled = true;
    };
  }, [api, props.initialAppId]);

  // Step two: the chosen app's connection fields.
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
        onClose={props.onClose}
        size="xl"
        titleIcon={
          <AppIcon
            src={selectedApp.iconSvg}
            srcDark={selectedApp.iconSvgDark}
            brandColor={selectedApp.brandColor}
            name={selectedApp.displayName}
            theme={props.theme}
            size={22}
          />
        }
        headerRight={
          props.initialAppId ? undefined : (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost"
              onClick={() => setSelectedApp(null)}
            >
              ← Apps
            </button>
          )
        }
      >
        <ConnectionConfig app={selectedApp} onCreated={props.onCreated} onClose={props.onClose} />
      </Modal>
    );
  }

  // Resolving an initialAppId — don't flash the picker.
  if (resolvingInitial) {
    return (
      <Modal title="Add connection" onClose={props.onClose} size="xl">
        <div className="w6w-stepbuilder-content">
          <p className="w6w-muted w6w-small">Loading…</p>
        </div>
      </Modal>
    );
  }

  // Step one: the shared searchable app picker (icons + search).
  return (
    <Modal title="Add connection" onClose={props.onClose} size="xl">
      <div className="w6w-stepbuilder-content">
        <AppPicker
          onSelectApp={setSelectedApp}
          theme={props.theme}
          searchPlaceholder="Search apps to connect…"
          categoryFilter
        />
      </div>
    </Modal>
  );
}

/**
 * The chosen app's connection form: pick an auth method (when >1), name the
 * connection, fill the credential fields (or run OAuth), and submit.
 */
function ConnectionConfig({
  app,
  onCreated,
  onClose,
}: {
  app: AppSummary;
  onCreated: (result: { connectionId: string }) => void;
  onClose: () => void;
}) {
  const api = useW6WApi();
  const [auths, setAuths] = useState<AuthDef[] | null>(null);
  const [authKey, setAuthKey] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [credential, setCredential] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Credential step (serviceAccount auths only). `createdId` survives a failed connection call so a
  // retry attaches the credential already stored instead of storing a second copy.
  const [stored, setStored] = useState<CredentialSummary[] | null>(null);
  const [pickedMode, setPickedMode] = useState<"existing" | "new" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [credName, setCredName] = useState("");
  const [bindingVals, setBindingVals] = useState<Record<string, unknown>>({});
  const createdId = useRef<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setAuths(null);
    api
      .getAppAuth(app.id)
      // Hide methods the server flagged unavailable (e.g. oauth2 with no host creds).
      .then((a) => !canceled && setAuths(a.filter((x) => x.available !== false)))
      .catch((e) => !canceled && setError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, app.id]);

  const available = auths ?? [];
  // User's pick, else the server-flagged default (over the already-filtered
  // list, so an unavailable default falls through), else the first.
  const auth: AuthDef | undefined =
    available.find((a) => a.key === authKey) ??
    available.find((a) => a.default === true) ??
    available[0];
  const fields: AuthField[] = auth?.fields ?? [];
  const isOAuth = auth?.type === "oauth2";
  // The Credential step needs the auth to declare `serviceAccount` AND the host to supply both
  // credential methods; otherwise this is the plain inline-credential form.
  const sa = auth?.serviceAccount;
  const listCredentials = api.listCredentials;
  const createCredential = api.createCredential;
  const credentialStep =
    !isOAuth &&
    !!sa &&
    typeof listCredentials === "function" &&
    typeof createCredential === "function";
  const contract = sa?.accepts?.[0] ?? "";
  const usable = (stored ?? []).filter((c) => c.contract === contract && c.status === "active");
  const mode: "existing" | "new" = usable.length === 0 ? "new" : (pickedMode ?? "existing");
  const chosenId = usable.some((c) => c.id === selectedId) ? selectedId : (usable[0]?.id ?? "");
  const bindingFields = credentialStep && sa ? bindingFieldsFor(sa) : [];

  useEffect(() => {
    if (!credentialStep || !listCredentials) return;
    let canceled = false;
    setStored(null);
    setPickedMode(null);
    createdId.current = null;
    listCredentials
      .call(api, { contract })
      .then((list) => !canceled && setStored(list))
      .catch(() => !canceled && setStored([]));
    return () => {
      canceled = true;
    };
    // `credentialStep`/`contract` change only when the auth does; `api` is the host's stable object.
  }, [api, credentialStep, contract, listCredentials]);
  // The synthetic "no connection needed" entry `GET /apps/:id/auths` appends
  // for a zero-credential-flagged tenant (`admin/apps-catalog.ts`) — matched
  // by `key`, never `type` (its `type` is the existing `"custom"` value,
  // shared with real custom auth methods; `key: "zero-credential"` is the
  // one thing only this synthetic entry carries). Selecting it needs no
  // fields and no real `POST /apps/:id/connections` — the tenant is already
  // "connected" via the flag (`admin/connections.ts`'s own synthetic
  // `zerocred:<appId>` summary), so submitting here just reports that same
  // id back rather than creating a second, real row for nothing to store.
  const isZeroCred = auth?.key === "zero-credential";
  const blank = (v: unknown) => v === undefined || v === "";
  const requiredMissing =
    !isOAuth &&
    !isZeroCred &&
    (credentialStep
      ? stored === null ||
        bindingFields.some((f) => f.required && blank(bindingVals[f.key])) ||
        (mode === "existing"
          ? chosenId === ""
          : credName.trim() === "" || fields.some((f) => f.required && blank(credential[f.key])))
      : fields.some((f) => f.required && blank(credential[f.key])));
  // Hoisted once — shared by the primary button's `disabled` and the
  // enter-to-submit hook's `enabled`, so Enter can never do something the
  // button itself refuses to do.
  const submitDisabled = !auth || (!isOAuth && !isZeroCred && requiredMissing) || pending;

  async function submit() {
    if (!auth) return;
    setError(null);
    setPending(true);
    try {
      if (isZeroCred) {
        onCreated({ connectionId: `zerocred:${app.id}` });
      } else if (isOAuth) {
        const { authorizationUrl } = await api.startAppOAuthFlow(app.id, auth.key, {
          displayName: displayName || undefined,
        });
        const { connectionId } = await startOAuthPopup(authorizationUrl);
        onCreated({ connectionId });
      } else if (credentialStep && createCredential) {
        let credentialId = mode === "existing" ? chosenId : createdId.current;
        if (credentialId === null) {
          const parsed = parseJsonFields(fields, credential);
          if ("error" in parsed) {
            setError(parsed.error);
            return;
          }
          const made = await createCredential.call(api, {
            name: credName.trim(),
            contract,
            source: parsed.values,
          });
          createdId.current = made.id;
          credentialId = made.id;
        }
        const binding = buildBinding(bindingFields, bindingVals);
        const body: CreateConnectionBody = {
          authKey: auth.key,
          credentialId,
          ...(binding ? { binding } : {}),
          ...(displayName ? { displayName } : {}),
        };
        const conn = await api.createConnection(app.id, body);
        onCreated({ connectionId: conn.id });
      } else {
        const parsed = parseJsonFields(fields, credential);
        if ("error" in parsed) {
          setError(parsed.error);
          return;
        }
        const conn = await api.createConnection(app.id, {
          authKey: auth.key,
          credential: parsed.values,
          displayName: displayName || undefined,
        });
        onCreated({ connectionId: conn.id });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  const enterSubmit = useEnterSubmit(submit, { enabled: !submitDisabled });

  return (
    // `.w6w-stepconfig` frame + body + pinned footer (D-3) — the same shape the
    // step builder's own config pane uses, so only the form scrolls and
    // Cancel/Save never leave the dialog's bottom.
    <div className="w6w-stepconfig">
      <div className="w6w-modal-body">
        <div className="w6w-stack">
          {auths === null && <p className="w6w-muted w6w-small">Loading auth methods…</p>}

          {auths !== null && available.length === 0 && (
            <p className="w6w-muted w6w-small">
              This app has no available auth methods. If it uses OAuth, its client credentials may
              not be configured on the server yet.
            </p>
          )}

          {available.length > 1 && (
            <label className="w6w-field">
              <span>Auth method</span>
              <select
                value={auth?.key ?? ""}
                onChange={(e) => {
                  setAuthKey(e.target.value);
                  setCredential({});
                  setBindingVals({});
                  createdId.current = null;
                  setError(null);
                }}
              >
                {available.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.displayName ?? a.key} ({a.type})
                  </option>
                ))}
              </select>
            </label>
          )}

          {auth && (
            <>
              {!isZeroCred && (
                <label className="w6w-field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Production API key"
                    maxLength={80}
                    // A plain text field above a credential field gets treated as the
                    // "username" of a login form and prefilled — opt it out.
                    name="w6w-connection-label"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    {...enterSubmit}
                  />
                </label>
              )}
              {auth.description && <p className="w6w-muted w6w-small">{auth.description}</p>}
              {isZeroCred ? null : isOAuth ? (
                <p className="w6w-muted w6w-small">
                  You'll be redirected to <strong>{auth.displayName ?? auth.key}</strong> to
                  authorize this connection.
                </p>
              ) : credentialStep && sa ? (
                <>
                  <CredentialPicker
                    credentials={usable}
                    mode={mode}
                    onModeChange={(m) => {
                      setPickedMode(m);
                      createdId.current = null;
                    }}
                    selectedId={chosenId}
                    onSelect={setSelectedId}
                    canUseExisting={usable.length > 0}
                    contract={contract}
                  />
                  {sa.scopes.length > 0 && (
                    <p className="w6w-muted w6w-small">
                      Scopes: <code>{sa.scopes.join(" ")}</code>
                    </p>
                  )}
                  {bindingFields.length > 0 && (
                    <AuthFieldsForm
                      fields={bindingFields}
                      values={bindingVals}
                      onChange={setBindingVals}
                      enterSubmitProps={enterSubmit}
                    />
                  )}
                  {mode === "new" && (
                    <>
                      <label className="w6w-field">
                        <span>Credential name *</span>
                        <input
                          type="text"
                          value={credName}
                          onChange={(e) => setCredName(e.target.value)}
                          placeholder="e.g. Workspace automation"
                          maxLength={80}
                          name="w6w-credential-name"
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          data-bwignore="true"
                          data-form-type="other"
                          {...enterSubmit}
                        />
                      </label>
                      <AuthFieldsForm
                        fields={fields}
                        values={credential}
                        onChange={setCredential}
                        enterSubmitProps={enterSubmit}
                      />
                    </>
                  )}
                </>
              ) : (
                <AuthFieldsForm
                  fields={fields}
                  values={credential}
                  onChange={setCredential}
                  enterSubmitProps={enterSubmit}
                />
              )}
            </>
          )}

          {error && <div className="w6w-result w6w-error">{error}</div>}
        </div>
      </div>
      <div className="w6w-modal-actions">
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="w6w-btn" disabled={submitDisabled} onClick={submit}>
          {pending
            ? isZeroCred
              ? "Saving…"
              : isOAuth
                ? "Waiting for authorization…"
                : "Saving…"
            : isZeroCred
              ? "Use this"
              : isOAuth
                ? `Sign in with ${auth?.displayName ?? auth?.key ?? "provider"}`
                : "Save connection"}
        </button>
      </div>
    </div>
  );
}
