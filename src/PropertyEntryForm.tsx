import { useRef, useState } from "react";
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
  /**
   * **The validity-out.** Fired (on change only) with whether the raw-JSON draft
   * currently *is* a values map. A draft that does not parse — **or that parses
   * to an array / scalar / `null`** — never reaches `onChange`, so without this
   * channel a host cannot tell "the user is mid-edit on something that isn't a
   * values map" from "the user is happy with what's collected", and would run
   * the *previous* payload silently. Hosts that execute something (the canvas ▶
   * Run) MUST gate their run affordance on it. Always `true` while the field
   * form is showing — a form cannot be syntactically wrong.
   */
  onValidityChange?: (valid: boolean) => void;
  readOnly?: boolean;
  /** Which view opens first. Defaults to the field form. */
  initialView?: EntryView;
}

/**
 * Whether a parsed JSON draft IS a values map. An array, a scalar and `null` all
 * parse but are not a set of values — and `typeof null === "object"`, so the
 * null arm is load-bearing, not defensive noise (dropping it lets `null` through
 * as the whole values object and blows up the required-check downstream).
 */
function isValuesMap(parsed: unknown): parsed is Record<string, unknown> {
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
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
 * corrupt what has been collected. Because such a draft is *silently* held back,
 * the form also reports it through `onValidityChange` (the validity-out): a host
 * that runs something real must gate its run affordance on that, or it would
 * execute the previous payload while the operator looks at a different one. The
 * toggle is the shared {@link ConfigViewToggle}, narrowed to its two views.
 *
 * With **no declared params** (a webhook trigger, an action with no schema)
 * there is nothing to render a form from, so it shows the raw-JSON view alone
 * and hides the toggle.
 */
export function PropertyEntryForm({
  params,
  values,
  onChange,
  onValidityChange,
  readOnly,
  initialView = "props",
}: PropertyEntryFormProps) {
  const hasFields = params.length > 0;
  const [view, setView] = useState<EntryView>(initialView);
  // No params ⇒ there is no form to show, so the raw view is the only view.
  const showJson = !hasFields || view === "code";
  // The JSON draft is local text: it is re-seeded from the VALUES (never from
  // the param *definitions* — that blob-where-a-form-should-be is the bug this
  // form exists to kill) whenever the raw view is (re-)entered, and only flows
  // back when it parses to a values map.
  const [text, setText] = useState(() => toJsonText(values));
  // Whether the current raw draft is a values map. Mirrored in a ref so the
  // validity-out fires on *change* only — no effect, no render loop.
  const [draftValid, setDraftValid] = useState(true);
  const validRef = useRef(true);
  const emitValid = (next: boolean) => {
    if (next === validRef.current) return;
    validRef.current = next;
    setDraftValid(next);
    onValidityChange?.(next);
  };

  const openView = (next: EntryView) => {
    // Either way the old draft is discarded: entering the raw view re-seeds it
    // from the values, leaving it drops it. So validity resets with it.
    if (next === "code") setText(toJsonText(values));
    emitValid(true);
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
              // Only a plain object IS a values map — an array, a scalar or
              // `null` is a half-typed edit, not a new set of values. It never
              // reaches `onChange`, so the host is told through the validity-out
              // instead of silently keeping (and running) the previous payload.
              const ok = isValuesMap(parsed);
              emitValid(ok);
              if (ok) onChange(parsed);
            }}
            // Fires for unparseable text too, where `onValidChange` never does.
            onValidityChange={(r) => {
              if (!r.valid) emitValid(false);
            }}
          />
          {!draftValid && (
            <span className="w6w-hint">
              This draft isn’t a JSON object yet — the collected values are unchanged until it is.
            </span>
          )}
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
