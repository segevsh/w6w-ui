import type { KeyboardEventHandler } from "react";
import type { AuthField } from "../types.ts";

interface Props {
  fields: AuthField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /**
   * Spread onto every field's `<input>` — from the caller's own
   * `useEnterSubmit(submit, { enabled })`, so Enter in a credential field
   * submits the same way the form's primary button does. Optional so this
   * component still works with no submit-on-Enter wiring at all.
   */
  enterSubmitProps?: { onKeyDown: KeyboardEventHandler<HTMLElement> };
  /**
   * `"create"` (default) seeds each field from its manifest `default`. `"edit"` is for replacing
   * part of a stored credential: it never seeds `default`, gives secret inputs the placeholder
   * `•••••• (unchanged)`, and reports an emptied number input as `""` (not `0`) so the caller can
   * treat blank as "keep what is stored".
   */
  mode?: "create" | "edit";
}

/**
 * Parses every filled `json` field of `values` (they are held as raw text while typing). Returns
 * the values with those fields parsed, or an `error` naming the offending field by label. The
 * error NEVER contains the typed text or the parser's message (which can quote it): a pasted key
 * file that is almost valid must not be echoed back into the page.
 */
export function parseJsonFields(
  fields: AuthField[],
  values: Record<string, unknown>,
): { values: Record<string, unknown> } | { error: string } {
  const out: Record<string, unknown> = { ...values };
  for (const f of fields) {
    const v = values[f.key];
    if (f.type !== "json" || typeof v !== "string" || v.trim() === "") continue;
    try {
      out[f.key] = JSON.parse(v);
    } catch {
      return { error: `${f.label} is not valid JSON. Check it and try again.` };
    }
  }
  return { values: out };
}

/**
 * Renders the form for an Auth method's `fields` declaration. Field shape
 * comes from the app's manifest so no app-specific knowledge is needed here.
 */
export function AuthFieldsForm({
  fields,
  values,
  onChange,
  enterSubmitProps,
  mode = "create",
}: Props) {
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
        const edit = mode === "edit";
        const value = (values[field.key] ?? (edit ? undefined : field.default) ?? "") as
          | string
          | number
          | boolean;
        if (field.type === "boolean") {
          return (
            <label key={field.key} className="w6w-field">
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => update(field.key, e.target.checked)}
                  {...enterSubmitProps}
                />
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.hint && <span className="w6w-hint">{field.hint}</span>}
            </label>
          );
        }
        const isSecret = field.type === "secret" || field.secret === true;
        if (field.type === "json" || field.type === "text") {
          // A plain textarea, deliberately not the step builder's JSON param editor, which offers
          // expression bindings, and a credential must never be bound to a run-time value. The raw
          // text is held as typed; callers parse `json` fields at submit (see `parseJsonFields`).
          // Enter inserts a newline, so it is not wired to submit.
          return (
            <label key={field.key} className="w6w-field">
              <span>
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <textarea
                className={isSecret ? "w6w-secret-input" : undefined}
                rows={field.type === "json" ? 6 : 3}
                value={String(value ?? "")}
                placeholder={edit && isSecret ? "•••••• (unchanged)" : undefined}
                onChange={(e) => update(field.key, e.target.value)}
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
        }
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
              placeholder={edit && isSecret ? "•••••• (unchanged)" : undefined}
              onChange={(e) =>
                update(
                  field.key,
                  field.type === "number" && !(edit && e.target.value === "")
                    ? Number(e.target.value)
                    : e.target.value,
                )
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
              {...enterSubmitProps}
            />
            {field.hint && <span className="w6w-hint">{field.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}
