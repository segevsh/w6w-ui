import type { AuthField } from "../types.ts";

interface Props {
  fields: AuthField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

/**
 * Renders the form for an Auth method's `fields` declaration. Field shape
 * comes from the app's manifest so no app-specific knowledge is needed here.
 */
export function AuthFieldsForm({ fields, values, onChange }: Props) {
  const update = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <div className="w6w-stack">
      {fields.length === 0 && (
        <p className="w6w-muted w6w-small">
          This auth method declares no fields — nothing to fill in. The credential will be an empty
          object.
        </p>
      )}
      {fields.map((field) => {
        const value = (values[field.key] ?? field.default ?? "") as string | number | boolean;
        if (field.type === "boolean") {
          return (
            <label key={field.key} className="w6w-field">
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => update(field.key, e.target.checked)}
                />
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.hint && <span className="w6w-hint">{field.hint}</span>}
            </label>
          );
        }
        const inputType =
          field.type === "secret" ? "password" : field.type === "number" ? "number" : "text";
        return (
          <label key={field.key} className="w6w-field">
            <span>
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <input
              type={inputType}
              value={String(value ?? "")}
              onChange={(e) =>
                update(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
              }
              // These are app credentials (API keys, tokens), not login passwords.
              // `autoComplete="off"` is ignored by Chrome for password inputs, so
              // secret fields use `new-password` — the one value that reliably
              // suppresses autofill of the user's saved login password. An
              // obfuscated `name` keeps the browser from treating this as a login
              // form (which would prefill the username into a sibling text field).
              name={`w6w-cred-${field.key}`}
              autoComplete={field.type === "secret" ? "new-password" : "off"}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
            />
            {field.hint && <span className="w6w-hint">{field.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}
