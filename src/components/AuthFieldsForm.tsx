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
        const isSecret = field.type === "secret";
        // Credentials (API keys, tokens) are NOT login passwords. Never use
        // `type="password"` — that's the sole trigger for the browser's
        // "save password?" prompt and for suggesting saved passwords. Secrets are
        // plain text fields masked with CSS (`-webkit-text-security`) so they
        // still read as dots without ever being a password field.
        const inputType = field.type === "number" ? "number" : "text";
        return (
          <label key={field.key} className="w6w-field">
            <span>
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <input
              type={inputType}
              className={isSecret ? "w6w-secret-input" : undefined}
              value={String(value ?? "")}
              onChange={(e) =>
                update(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
              }
              // Belt-and-braces opt-out from browser autofill + password managers.
              name={`w6w-cred-${field.key}`}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
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
