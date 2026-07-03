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
              autoComplete={field.type === "secret" ? "new-password" : "off"}
            />
            {field.hint && <span className="w6w-hint">{field.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}
