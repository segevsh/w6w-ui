import type {
  AuthField,
  ConnectionBinding,
  CredentialSummary,
  ServiceAccountConfig,
} from "../types.ts";

export interface CredentialPickerProps {
  /** Credentials to offer. Pass them already filtered; this component renders them as given. */
  credentials: CredentialSummary[];
  /** `"existing"` picks one of `credentials`; `"new"` is for the caller's create form. */
  mode: "existing" | "new";
  onModeChange: (mode: "existing" | "new") => void;
  /** The chosen credential id (`""` for none). Only used in `"existing"` mode. */
  selectedId: string;
  onSelect: (id: string) => void;
  /** False hides the "Use existing" choice (nothing to choose from). Default true. */
  canUseExisting?: boolean;
  /** The contract the credential must satisfy, shown as a hint. */
  contract?: string;
}

/**
 * The Use existing / Create new switch of a connection's Credential step, plus the list of stored
 * credentials. Presentational: no API access, no state of its own. Each option shows the
 * credential's name and its non-secret `display` values, never a payload. The "Create new" form
 * itself (name + fields) is the caller's, rendered beneath this.
 */
export function CredentialPicker({
  credentials,
  mode,
  onModeChange,
  selectedId,
  onSelect,
  canUseExisting = true,
  contract,
}: CredentialPickerProps) {
  const label = (c: CredentialSummary) => {
    const shown = Object.values(c.display ?? {}).filter(Boolean);
    return shown.length > 0 ? `${c.name} (${shown.join(", ")})` : c.name;
  };
  return (
    <div className="w6w-stack">
      {canUseExisting && (
        <div className="w6w-field" role="radiogroup" aria-label="Credential">
          <span>Credential{contract ? ` (${contract})` : ""}</span>
          <label>
            <input
              type="radio"
              name="w6w-credential-mode"
              checked={mode === "existing"}
              onChange={() => onModeChange("existing")}
            />{" "}
            Use existing
          </label>
          <label>
            <input
              type="radio"
              name="w6w-credential-mode"
              checked={mode === "new"}
              onChange={() => onModeChange("new")}
            />{" "}
            Create new
          </label>
        </div>
      )}
      {canUseExisting && mode === "existing" && (
        <label className="w6w-field">
          <span>Stored credential</span>
          <select
            name="w6w-credential-id"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * The binding fields a `serviceAccount` auth asks for on a connection. `delegatedUser` is always
 * labelled "Impersonated user" (the person the credential acts as, never the connection's owner),
 * is absent when impersonation is `"none"` even if declared, and is synthesised when impersonation
 * is allowed but the auth declares no such field.
 */
export function bindingFieldsFor(sa: ServiceAccountConfig): AuthField[] {
  const others = (sa.bindingFields ?? []).filter((f) => f.key !== "delegatedUser");
  if (sa.impersonation === "none") return others;
  const declared = (sa.bindingFields ?? []).find((f) => f.key === "delegatedUser");
  const delegated: AuthField = {
    ...(declared ?? { type: "string" }),
    key: "delegatedUser",
    label: "Impersonated user",
    type: "string",
    required: sa.impersonation === "required",
  };
  return [delegated, ...others];
}

/**
 * Maps typed binding values to the wire `binding`: `delegatedUser` stays top-level, every other key
 * goes under `settings`, blank values are dropped, and an empty result is `undefined`. `scopes` is
 * never sent (the server applies the auth's declared scopes).
 */
export function buildBinding(
  fields: AuthField[],
  values: Record<string, unknown>,
): ConnectionBinding | undefined {
  const binding: ConnectionBinding = {};
  const settings: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.key === "delegatedUser") binding.delegatedUser = String(v);
    else settings[f.key] = v as string | number | boolean;
  }
  if (Object.keys(settings).length > 0) binding.settings = settings;
  return Object.keys(binding).length > 0 ? binding : undefined;
}
