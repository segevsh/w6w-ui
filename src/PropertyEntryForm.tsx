import { useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { ConfigViewToggle } from "./StepBuilderModal.tsx";
import type { ActionParam } from "./types.ts";

/** The two views this form offers — a subset of the editor's `ConfigView`. */
const VIEWS = ["props", "code"] as const;
type EntryView = (typeof VIEWS)[number];

export interface PropertyEntryFormProps {
  /** Declared params to collect values for. Empty ⇒ raw-JSON only. */
  params: ActionParam[];
  /** Current values, keyed by param `key`. */
  values: Record<string, unknown>;
  /** Fired with the next values object on every (valid) edit. */
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  /** Which view opens first. Defaults to the field form. */
  initialView?: EntryView;
}

/**
 * The one property-entry surface: a param form ⇄ raw-JSON editor over a single
 * `values` object. **Chrome-less and value-emitting** — its root is a plain
 * `div.w6w-stack`, it owns no modal, no header, no run button and no result
 * pane. It collects values and emits them through `onChange`; the *host* decides
 * what to do with them (Test invokes, Run executes the step) and supplies any
 * surrounding chrome.
 *
 * That is deliberate: it is mounted both inline inside an already-open
 * `<dialog>` (the step editor's Test tab) and inside a modal of its own (Run).
 * Rendering a modal in here would give the first host a modal-in-a-modal —
 * which *works* mechanically, since this library's modal is a native
 * `<dialog>` that top-layer-stacks, and just looks wrong.
 *
 * The fields view is {@link ParamsForm} reused as-is, so per-field `ƒx`
 * (expression binding) comes for free. The raw view is {@link JsonEditor} bound
 * to the **values** object — never the field *definitions* — and only pushes
 * back when the text parses to a plain object, so an invalid draft cannot
 * corrupt what has been collected. The toggle is the shared
 * {@link ConfigViewToggle}, narrowed to its two relevant views.
 *
 * With **no declared params** (a webhook trigger, an action with no schema)
 * there is nothing to render a form from, so it shows the raw-JSON view alone
 * and hides the toggle.
 */
export function PropertyEntryForm({
  params,
  values,
  onChange,
  readOnly,
  initialView = "props",
}: PropertyEntryFormProps) {
  const hasFields = params.length > 0;
  const [view, setView] = useState<EntryView>(initialView);
  // No params ⇒ there is no form to show, so the raw view is the only view.
  const showJson = !hasFields || view === "code";
  // The JSON draft is local text: it is re-seeded from `values` whenever the
  // raw view is (re-)entered, and only flows back when it parses.
  const [text, setText] = useState(() => toJsonText(values));

  const openView = (next: EntryView) => {
    if (next === "code") setText(toJsonText(values));
    setView(next);
  };

  // A webhook-style payload gets the plainer label; alongside a field form the
  // raw view is explicitly "the same values, as JSON".
  const label = hasFields ? "Values (JSON)" : "Payload";

  return (
    <div className="w6w-stack">
      {/* Right-aligned, like the toggle's other two call sites in their tabs
          bar. Inline style because the form owns no chrome of its own — no new
          rule in `styles.css` for a one-line layout. */}
      {hasFields && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <ConfigViewToggle
            view={view}
            views={[...VIEWS]}
            onChange={(v) => openView(v as EntryView)}
          />
        </div>
      )}

      {showJson ? (
        <div className="w6w-field">
          <span>{label}</span>
          <JsonEditor
            value={text}
            onChange={setText}
            readOnly={readOnly}
            minHeight="140px"
            aria-label={`${label} JSON`}
            onValidChange={(parsed) => {
              // Only a plain object IS a values map — an array or a scalar draft
              // is a half-typed edit, not a new set of values.
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                onChange(parsed as Record<string, unknown>);
              }
            }}
          />
        </div>
      ) : (
        <ParamsForm params={params} values={values} onChange={onChange} readOnly={readOnly} />
      )}
    </div>
  );
}

/** Render a values object as the editor's starting text. */
function toJsonText(values: Record<string, unknown>): string {
  return JSON.stringify(values ?? {}, null, 2);
}
