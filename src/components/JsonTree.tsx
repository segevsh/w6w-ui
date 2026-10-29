/**
 * A read-only, dependency-free tree for a parsed JSON value.
 *
 * Deliberately NOT exported from `src/index.ts` (`T0.1.1` pin 2): the public
 * way to show a result is `ResultViewer`, which owns the format decision and
 * the toolbar. `JsonTree` is the piece `ResultViewer` composes for
 * `format: "json"`, so it stays private until a consumer needs a bare tree.
 *
 * Two properties everything here is built around:
 *
 *  - **Nothing is injected.** Every key, every scalar and every brace reaches
 *    the DOM as a React text child — there is no `dangerouslySetInnerHTML`
 *    anywhere in this file. A property key such as `"<img onerror=…>"` is just
 *    text, which is the whole point: the value came from a vendor API.
 *  - **Collapsing is a native `<details>`.** The children are always rendered
 *    and the browser hides them, so collapsed text stays in the DOM: it is
 *    selectable, findable by the browser's find-in-page, and readable by a
 *    test. Re-rendering the subtree "only when open" would silently make the
 *    collapsed content unreachable.
 */

/** The scalar kinds a leaf can be — the class suffix `w6w-json-<kind>`. */
type JsonKind = "string" | "number" | "boolean" | "null";

/** `undefined`, functions and symbols cannot come out of `JSON.parse`, but a
 *  caller can hand `ResultViewer` any JS value; they render as `null`, which
 *  is what `JSON.stringify` would write for them inside an object. */
function kindOf(value: unknown): JsonKind {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "null";
}

/** The printed form of a scalar. A string keeps its JSON quotes (and escapes
 *  its newlines/quotes) so the tree cannot be confused with the surrounding
 *  structure; `JSON.stringify` is also what makes a hostile string inert. */
function scalarText(value: unknown): string {
  return kindOf(value) === "string" ? JSON.stringify(value) : String(value);
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function countLabel(isArray: boolean, n: number): string {
  return isArray ? `${n} items` : `${n} keys`;
}

export interface JsonTreeProps {
  /** Any value; objects and arrays become collapsible nodes, the rest leaves. */
  value: unknown;
  /**
   * How many levels start open. A node at depth `d` (root `d = 0`) is open iff
   * `d < expandDepth`, so the default `2` opens the root and its children —
   * enough to see the shape of a response without scrolling. `Infinity` opens
   * everything; `1` leaves only the root open.
   */
  expandDepth?: number;
}

export function JsonTree({ value, expandDepth = 2 }: JsonTreeProps) {
  return <JsonNode label={undefined} value={value} depth={0} expandDepth={expandDepth} />;
}

/** One node. A non-empty object/array is a `<details>`; everything else —
 *  every scalar and every EMPTY object/array — is a one-line leaf, because an
 *  empty container has nothing to collapse and a toggle that opens onto
 *  nothing reads as a bug. */
function JsonNode(props: {
  label: string | number | undefined;
  value: unknown;
  depth: number;
  expandDepth: number;
}) {
  const { label, value, depth, expandDepth } = props;
  const container = isContainer(value);
  const isArray = Array.isArray(value);
  const entries: Array<[string | number, unknown]> = container
    ? isArray
      ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(value as Record<string, unknown>)
    : [];

  const key = label === undefined ? null : <span className="w6w-json-key">{label}</span>;

  if (container && entries.length > 0) {
    return (
      <details className="w6w-json-node" open={depth < expandDepth}>
        <summary>
          {key}
          {isArray ? "[…]" : "{…}"}
          <span className="w6w-json-count">{countLabel(isArray, entries.length)}</span>
        </summary>
        {/* Always rendered: the browser collapses it, not us (`see above`). */}
        <div className="w6w-json-children">
          {entries.map(([k, v]) => (
            <JsonNode
              key={String(k)}
              label={k}
              value={v}
              depth={depth + 1}
              expandDepth={expandDepth}
            />
          ))}
        </div>
      </details>
    );
  }

  // A leaf: a scalar, or an empty `{}` / `[]`. The root of a tree has no key,
  // so it also has no `key: ` separator in front of it.
  return (
    <div className="w6w-json-leaf">
      {key}
      {key === null ? null : ": "}
      <span className={`w6w-json-${container ? "null" : kindOf(value)}`}>
        {container ? (isArray ? "[]" : "{}") : scalarText(value)}
      </span>
    </div>
  );
}
