import { useMemo } from "react";
import { type DataVar, flattenParams, isParamVisible } from "../ParamsForm.tsx";
import type { StepStartState } from "../provider.tsx";
import {
  type ResolveScope,
  type ResolvedSegment,
  buildResolveScope,
  resolveParamValue,
} from "../resolve-params.ts";
import type { ActionParam } from "../types.ts";
import { useExpressionOptions } from "./ExpressionOptions.tsx";
import { varLabel } from "./expression-dom.ts";

export interface ResolvedParamsProps {
  /** The action's declared params — same list `ParamsForm` renders on Configure. */
  params: ActionParam[];
  /** What will actually be submitted: `{ ...step.with, ...override }` — `testValues`, not `step.with`. */
  values: Record<string, unknown>;
  /** The exact object the test invoke sends as `state` — `steps.*`/`trigger.*` resolve against this. */
  testStartState?: StepStartState;
}

/**
 * Read-only sibling of `ParamsForm`: for every configured param, shows the
 * value it resolves to against the current test scope instead of an editable
 * widget. Mounts no `contentEditable`, no `ƒx` button, no input, and never
 * calls an `onChange` — this is the Test tab's "what will actually be sent"
 * view, not a second place to edit params.
 *
 * Reuses `flattenParams`/`isParamVisible` from `ParamsForm.tsx` (same order +
 * visibility the Configure tab uses) rather than re-flattening sections, and
 * the static chip vocabulary (`varLabel`, `.w6w-expr-chip-*`) rather than
 * `expression-dom.ts`'s DOM-painting, which is for the editable field.
 */
export function ResolvedParams({ params, values, testStartState }: ResolvedParamsProps) {
  const { sampleValues } = useExpressionOptions();
  const scope = useMemo(
    () => buildResolveScope(sampleValues, testStartState),
    [sampleValues, testStartState],
  );
  const flat = flattenParams(params);
  const effective = (key: string) =>
    values[key] !== undefined ? values[key] : flat.find((p) => p.key === key)?.default;
  // Sections are layout-only containers with no value of their own (their
  // children, already flattened, carry the values) — skip rendering a row for
  // the section param itself, exactly as `ParamsForm`'s own `renderOne` does.
  const rows = flat.filter((p) => p.type !== "section" && isParamVisible(p, effective));

  if (rows.length === 0) {
    return (
      <div className="w6w-resolved-params">
        <p className="w6w-muted w6w-small">This action takes no parameters.</p>
      </div>
    );
  }

  return (
    // A dedicated wrapper class — not just `.w6w-stack` — so a host/test can
    // scope to exactly these rows: `IncomingStateField` above also renders a
    // top-level `.w6w-field` (its own container class), which a bare
    // `.w6w-field` query would otherwise pick up too.
    <div className="w6w-resolved-params w6w-stack">
      {rows.map((param) =>
        param.type === "vars" ? (
          <ResolvedVarsRow key={param.key} param={param} value={values[param.key]} scope={scope} />
        ) : (
          <ResolvedParamRow
            key={param.key}
            label={param.label ?? param.key}
            segments={resolveParamValue(
              values[param.key] !== undefined ? values[param.key] : param.default,
              scope,
            )}
          />
        ),
      )}
    </div>
  );
}

function ResolvedParamRow({ label, segments }: { label: string; segments: ResolvedSegment[] }) {
  return (
    <div className="w6w-field">
      <span>{label}</span>
      <div className="w6w-resolved-value">
        <ResolvedSegments segments={segments} />
      </div>
    </div>
  );
}

/** A `vars`-typed param: one row per configured key, each resolved independently (A5). */
function ResolvedVarsRow({
  param,
  value,
  scope,
}: {
  param: ActionParam;
  value: unknown;
  scope: ResolveScope;
}) {
  const rows: DataVar[] = Array.isArray(value)
    ? (value as DataVar[])
    : Array.isArray(param.default)
      ? (param.default as DataVar[])
      : [];
  return (
    <div className="w6w-field">
      <span>{param.label ?? param.key}</span>
      {rows.length === 0 ? (
        <p className="w6w-muted w6w-small">None configured.</p>
      ) : (
        <div className="w6w-stack">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id (mirrors ParamsForm's VarsField)
            <div className="w6w-resolved-value" key={i}>
              <code>{row.key || "(no key)"}</code>
              {" → "}
              <ResolvedSegments segments={resolveParamValue(row.value, scope)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResolvedSegments({ segments }: { segments: ResolvedSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are a positional, immutable render of one value's parts
        <ResolvedSegmentView key={i} segment={seg} />
      ))}
    </>
  );
}

/** One part's worth of chrome: a static chip (for anything ref-shaped) plus its outcome. */
function ResolvedSegmentView({ segment }: { segment: ResolvedSegment }) {
  switch (segment.status) {
    case "resolved":
      return segment.ref ? (
        <>
          <ExprChip kind="var" refName={segment.ref} />
          <span>{formatResolvedValue(segment.value)}</span>
        </>
      ) : (
        <span>{formatResolvedValue(segment.value)}</span>
      );
    case "unresolved":
      // Never the ref/template text as if it were the value: the chip shows
      // only the short display LABEL (never the full ref string — the same
      // "label ≠ ref" precedent `expression-dom.ts` documents), and the
      // outcome is a dedicated, always-non-blank badge.
      return (
        <>
          <ExprChip kind="var" refName={segment.ref} />
          <span className="w6w-param-unresolved">unresolved</span>
        </>
      );
    case "not-evaluated":
      return (
        <>
          <ExprChip kind="expr" />
          <span className="w6w-param-unevaluated">not evaluated</span>
        </>
      );
    case "masked":
      // The chip's 🔒 sigil already says "masked" — no separate badge needed,
      // and no ciphertext or plaintext is ever available to show here.
      return <ExprChip kind="secret" refName={segment.ref} />;
  }
}

const CHIP_SIGIL: Record<"var" | "secret" | "expr", string> = { var: "◆", secret: "🔒", expr: "ƒ" };

/**
 * A read-only chip, visually consistent with `expression-dom.ts`'s
 * `makeChip` (same classes/sigils, same `varLabel` shortening) but built on a
 * plain `<span>` — no `contentEditable`, no remove button, no DOM painting.
 */
function ExprChip({ kind, refName }: { kind: "var" | "secret" | "expr"; refName?: string }) {
  const label = kind === "expr" ? "expr" : varLabel(refName ?? "");
  return (
    <span className={`w6w-expr-chip w6w-expr-chip-${kind}`}>
      <span className="w6w-expr-chip-sigil">{CHIP_SIGIL[kind]}</span>
      <span className="w6w-expr-chip-label">{label}</span>
    </span>
  );
}

/**
 * A resolved value, formatted for display — never blank, even for the falsy
 * values `resolved` explicitly covers (`null`/`""`/`false`/`0`): each renders
 * visibly distinct text so it never reads as "nothing here" the way an actual
 * blank would.
 */
function formatResolvedValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "(not set)";
  if (value === "") return '""';
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
