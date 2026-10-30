/**
 * The pure, data-free vocabulary of a Data store (F-2, lifted from Studio's
 * `lib/data-stores-view`, `data-cells`, `data-grid` and `data-store-errors`).
 *
 * One import point for every consumer (Studio, `@w6w/embed`, the components in
 * this package): the wire types, the closed kind/scalar vocabularies, the
 * cell text codec, the row-draft/write helpers and the error locator. Paths,
 * query builders and cache keys deliberately stay in Studio.
 *
 * Pure and dependency-free on purpose: no React, no SDK, no `fetch`, only
 * relative imports, so `node --test` loads it with nothing but type-stripping.
 */

/** Display label per store kind (shared by every list and picker). */
export const DATA_STORE_KIND_LABEL = {
  kv: "Key-value",
  doc: "Document",
  table: "Table",
} as const;

// ── Wire vocabulary ──────────────────────────────────────────────────────────

/**
 * The three store shapes. `kv` holds one value per key, `doc` holds a JSON
 * document per key, `table` holds rows whose columns are declared in the
 * store's schema.
 */
export type DataStoreKind = "kv" | "doc" | "table";

/**
 * The server's scalar vocabulary (S-1). A value of this type is validated
 * server-side and stored as the string the caller sent — never coerced.
 */
export type ScalarType = "string" | "number" | "integer" | "boolean" | "date" | "datetime";

/** One declared table column (S-2). `default` is the column's JSON default, verbatim. */
export interface TableColumn {
  name: string;
  type: ScalarType;
  required: boolean;
  default?: unknown;
}

/** A `kv` store's schema (S-2): one scalar type for every value. */
export interface KvSchema {
  valueType: ScalarType;
}

/** A `table` store's schema (S-2); `key` names the column whose cell is the row's key. */
export interface TableSchema {
  columns: TableColumn[];
  key?: string;
}

/** A store as the wire carries it (S-3). Timestamps are ISO-8601 strings. */
export interface DataStore {
  id: string;
  kind: DataStoreKind;
  name: string;
  description: string;
  project: string;
  schema: Record<string, unknown>;
  entryCount: number;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** One entry as the wire carries it (S-3). `expiresAt` is `null` when the entry never expires. */
export interface Entry {
  key: string;
  value: unknown;
  version: number;
  sizeBytes: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /data-stores` — one page of stores plus the cursor for the next one. */
export interface DataStorePage {
  items: DataStore[];
  nextCursor?: string;
}

/** `GET /data-stores/:id/entries` — one page of entries (a table query never carries a cursor). */
export interface EntryPage {
  items: Entry[];
  nextCursor?: string;
}

/** `POST /data-stores/:id/import` — how many CSV rows the host upserted/appended. */
export interface ImportResult {
  imported: number;
}

/** `POST /data-stores` body. `schema` is the S-2 shape for the chosen `kind`. */
export interface DataStoreCreateInput {
  kind: DataStoreKind;
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

/** `PATCH /data-stores/:id` body — every field optional, none of them the kind. */
export interface DataStorePatch {
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

/** The closed set of store kinds, in the order the create dialog offers them. */
export const DATA_STORE_KINDS = ["kv", "doc", "table"] as const;

/** The closed set of scalar cell types, in the order the columns editor offers them. */
export const SCALAR_TYPES = ["string", "number", "integer", "boolean", "date", "datetime"] as const;

/** R-7: a CSV upload is at most 5 MB (5 242 880 bytes). The client checks before sending. */
export const CSV_MAX_BYTES = 5_242_880;

/**
 * A `kv` store's declared value type, defaulting to `"string"` — S-2's own
 * default, and the only safe reading of a schema the client did not write
 * (a store created before the field existed, or one whose schema is garbage).
 */
export function kvValueTypeOf(store: DataStore): ScalarType {
  const declared = store.schema?.valueType;
  return typeof declared === "string" && (SCALAR_TYPES as readonly string[]).includes(declared)
    ? (declared as ScalarType)
    : "string";
}

/**
 * A `table` store's schema, or `null` when the store is not a table or its
 * schema has no column array. `null` — not an empty column list — so the grid
 * can tell "not a table" from "a table with nothing declared".
 */
export function tableSchemaOf(store: DataStore): TableSchema | null {
  if (store.kind !== "table") return null;
  const columns = store.schema?.columns;
  if (!Array.isArray(columns)) return null;
  const key = store.schema?.key;
  return typeof key === "string"
    ? { columns: columns as TableColumn[], key }
    : { columns: columns as TableColumn[] };
}

/**
 * The filename to save an export under: the host's own `filename="…"` from the
 * `Content-Disposition` header when it sent one, otherwise `<store name>.csv`.
 * A header without that parameter (`attachment` alone, or `null` when a
 * proxy stripped it) falls back rather than producing a nameless file.
 */
export function csvFilenameOf(contentDisposition: string | null, storeName: string): string {
  const quoted = contentDisposition?.match(/filename="([^"]*)"/);
  const name = quoted?.[1];
  return name !== undefined && name !== "" ? name : `${storeName}.csv`;
}

// ── Cell codec ──────────────────────────────────────────────────────────────

/** Why a cell's text could not become a value. */
export type CellProblem =
  | "required"
  | "not_a_number"
  | "not_an_integer"
  | "not_a_boolean"
  | "not_a_date"
  | "not_a_datetime";

/** The one sentence rendered beside the offending cell, per problem. */
export const CELL_PROBLEM_COPY: Record<CellProblem, string> = {
  required: "Required.",
  not_a_number: "Enter a number.",
  not_an_integer: "Enter a whole number.",
  not_a_boolean: "Enter true or false.",
  not_a_date: "Enter a date as YYYY-MM-DD.",
  not_a_datetime: "Enter a date-time like 2026-01-31T09:30:00Z.",
};

/** The JSON number grammar, without the forms JSON itself would not round-trip (`01`, `+1`, `.5`, `1.`). */
const NUMBER_TEXT = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

/** A whole number: no fraction, no exponent. */
const INTEGER_TEXT = /^-?(0|[1-9]\d*)$/;

/** `YYYY-MM-DD` — the calendar check is {@linkcode isRealDate}. */
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/** RFC 3339 with an offset; the field ranges and the calendar are checked separately. */
const DATETIME_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Days in `month` (1–12) of `year`, Gregorian leap rule. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** `YYYY-MM-DD` split into numbers, or `null` when it is not a real calendar day. */
function readDate(text: string): { year: number; month: number; day: number } | null {
  if (!DATE_TEXT.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** The failure half of {@linkcode parseCell}'s answer, carrying the copy the cell renders. */
function refuse(problem: CellProblem) {
  return { ok: false as const, problem, message: CELL_PROBLEM_COPY[problem] };
}

/**
 * Turn the text an operator typed into the value the wire takes, for a column
 * of `type`.
 *
 * `required` is applied to the EMPTY cell only (R-7): every other rule is the
 * server's own, so a cell this returns `ok` for is a cell the server accepts.
 * `string` is the one type that keeps the text as typed — trimming it would
 * silently edit the operator's value.
 */
export function parseCell(
  type: ScalarType,
  text: string,
  required: boolean,
):
  | { ok: true; value: string | number | boolean | undefined }
  | { ok: false; problem: CellProblem; message: string } {
  const trimmed = text.trim();
  if (trimmed === "") {
    return required ? refuse("required") : { ok: true, value: undefined };
  }
  switch (type) {
    case "string":
      return { ok: true, value: text };
    case "number": {
      if (!NUMBER_TEXT.test(trimmed)) return refuse("not_a_number");
      const value = Number(trimmed);
      return Number.isFinite(value) ? { ok: true, value } : refuse("not_a_number");
    }
    case "integer": {
      if (!INTEGER_TEXT.test(trimmed)) return refuse("not_an_integer");
      const value = Number(trimmed);
      return Number.isSafeInteger(value) ? { ok: true, value } : refuse("not_an_integer");
    }
    case "boolean": {
      if (trimmed === "true") return { ok: true, value: true };
      if (trimmed === "false") return { ok: true, value: false };
      return refuse("not_a_boolean");
    }
    case "date":
      return readDate(trimmed) === null ? refuse("not_a_date") : { ok: true, value: trimmed };
    case "datetime":
      return isDateTime(trimmed) ? { ok: true, value: trimmed } : refuse("not_a_datetime");
  }
}

/** RFC 3339 text with a real calendar date, real clock fields and a well-formed offset. */
function isDateTime(text: string): boolean {
  if (!DATETIME_TEXT.test(text)) return false;
  if (readDate(text.slice(0, 10)) === null) return false;
  const hour = Number(text.slice(11, 13));
  const minute = Number(text.slice(14, 16));
  const second = Number(text.slice(17, 19));
  if (hour > 23 || minute > 59 || second > 59) return false;
  const rest = text.slice(19);
  const zone = rest.match(/(Z|([+-])(\d{2}):(\d{2}))$/);
  if (zone === null || zone[1] === "Z") return true;
  return Number(zone[3]) <= 23 && Number(zone[4]) <= 59;
}

/**
 * The text to put in a cell for an already-typed value.
 *
 * `undefined`/`null` render as the empty cell (never `"undefined"` or `"null"`);
 * a string value for a string-ish column is shown as itself; a finite number
 * and a boolean render as their JSON literals; anything else (an object cell,
 * a `null` inside a document) falls back to its JSON text so the cell shows
 * what the server holds rather than `[object Object]`.
 */
export function serializeCell(type: ScalarType, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (type === "string" || type === "date" || type === "datetime") {
    if (typeof value === "string") return value;
  }
  if (
    (type === "number" || type === "integer") &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }
  if (type === "boolean" && typeof value === "boolean") return value ? "true" : "false";
  const json = JSON.stringify(value);
  return json === undefined ? "" : json;
}

/**
 * Is an already-typed JSON value of `type`? The same rules {@linkcode parseCell}
 * applies to text, applied to a value that came back from the server — the grid
 * uses it to mark a row the server would refuse before the operator presses
 * Save. `required` plays no part here: an absent value is the caller's problem
 * to decide about, not this predicate's.
 */
export function isCellValue(type: ScalarType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isSafeInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && readDate(value) !== null;
    case "datetime":
      return typeof value === "string" && isDateTime(value);
  }
}

// ── Error locator ───────────────────────────────────────────────────────────

/** What is shown when the server said nothing a human can read. */
export const DATA_STORE_ERROR_FALLBACK = "The request failed.";

/** `rawRequest`'s `status: 0` — the request never reached the server. */
export const DATA_STORE_NETWORK_ERROR = "Could not reach the server.";

/** A failure, flattened into the fields the page needs and nothing else. */
export interface DataStoreErrorLocator {
  /** Always present: the server's own sentence, or one of the two copy constants above. */
  message: string;
  /** The host's machine-readable code (`invalid_value`, `invalid_cursor`, …). */
  code?: string;
  /** The HTTP status; `0` is the transport-failure convention. */
  status?: number;
  /** The request-body field the host blamed. */
  field?: string;
  /** The 0-based CSV data row the host blamed (header excluded). */
  row?: number;
  /** The table column the host blamed. */
  column?: string;
}

/** A non-empty string, or `undefined`. */
function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A 0-based row index, or `undefined` — a negative or fractional row is not a row. */
function rowOf(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

/**
 * Read `{ error: { code, message, field, row, column } }` out of whatever the
 * caller has, adding `status` from `status` when that is a number.
 *
 * `body` is a value of unknown shape (a parsed JSON body, or the `.raw` of an
 * `ApiError`); the envelope is nested under `error`, and an unshaped body
 * contributes nothing rather than a guess.
 */
function locatorFromEnvelope(
  body: unknown,
  fallbackMessages: unknown[],
  status: unknown,
): DataStoreErrorLocator {
  const locator: DataStoreErrorLocator = { message: DATA_STORE_ERROR_FALLBACK };
  if (typeof status === "number") locator.status = status;
  const envelope =
    body !== null && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (envelope !== null && typeof envelope === "object") {
    const error = envelope as {
      code?: unknown;
      message?: unknown;
      field?: unknown;
      row?: unknown;
      column?: unknown;
    };
    const code = textOf(error.code);
    if (code !== undefined) locator.code = code;
    const field = textOf(error.field);
    if (field !== undefined) locator.field = field;
    const column = textOf(error.column);
    if (column !== undefined) locator.column = column;
    const row = rowOf(error.row);
    if (row !== undefined) locator.row = row;
    const message = textOf(error.message);
    if (message !== undefined) locator.message = message;
  }
  if (locator.message === DATA_STORE_ERROR_FALLBACK) {
    for (const candidate of fallbackMessages) {
      const message = textOf(candidate);
      if (message !== undefined) {
        locator.message = message;
        break;
      }
    }
  }
  return locator;
}

/**
 * Locate a thrown JSON-call failure: an `ApiError` (whose parsed body lives on
 * `.raw`), a plain `Error`, or anything else at all.
 *
 * The message falls back in that order — the envelope's `message`, the error's
 * own `message`, then {@linkcode DATA_STORE_ERROR_FALLBACK} — so an unfamiliar
 * throw still produces a sentence rather than an empty panel.
 */
export function locateDataStoreError(e: unknown): DataStoreErrorLocator {
  try {
    const shaped =
      e !== null && typeof e === "object"
        ? (e as { raw?: unknown; status?: unknown; message?: unknown })
        : undefined;
    const raw = shaped?.raw;
    const ownMessage = shaped?.message;
    return locatorFromEnvelope(raw, [ownMessage], shaped?.status);
  } catch {
    return { message: DATA_STORE_ERROR_FALLBACK };
  }
}

/**
 * Locate a CSV-call failure from P-RAW's `{status, text}` — the body is still
 * unparsed text because that transport does not know the content type.
 *
 * `status: 0` means the request never produced a response, and gets the
 * transport sentence rather than an attempt to parse an empty body. Otherwise
 * the body is parsed iff it is JSON: an HTML error page from a proxy is
 * `{status, message: fallback}`, not a crash.
 */
export function locateRawResponseError(res: {
  status: number;
  text: string;
}): DataStoreErrorLocator {
  try {
    if (res.status === 0) {
      return {
        status: 0,
        code: "network_error",
        message: DATA_STORE_NETWORK_ERROR,
      };
    }
    let body: unknown;
    try {
      body = JSON.parse(res.text);
    } catch {
      return { status: res.status, message: DATA_STORE_ERROR_FALLBACK };
    }
    return locatorFromEnvelope(body, [], res.status);
  } catch {
    return { message: DATA_STORE_ERROR_FALLBACK };
  }
}

/** Where the message is rendered: under one table cell, under one form field, or over the whole form. */
export function errorPlacement(
  loc: DataStoreErrorLocator,
):
  | { kind: "cell"; column: string; row?: number }
  | { kind: "field"; field: string }
  | { kind: "form" } {
  const column = textOf(loc.column);
  if (column !== undefined) {
    const row = rowOf(loc.row);
    return row === undefined ? { kind: "cell", column } : { kind: "cell", column, row };
  }
  const field = textOf(loc.field);
  if (field !== undefined) return { kind: "field", field };
  return { kind: "form" };
}

/**
 * The operator's 1-based line number in the CSV they uploaded, from the host's
 * 0-based data-row index: the header row is line 1, so data row 0 is line 2.
 */
export function csvLineOf(row: number): number {
  return row + 2;
}

// ── Row drafts and writes ───────────────────────────────────────────────────

/**
 * The draft id of a row that does not exist yet: a NUL-prefixed sentinel, which
 * R-5 forbids a real key from ever being (no control characters in a key), so
 * `id === NEW_ROW_ID` and "this row has no server-side key" are the same fact.
 */
export const NEW_ROW_ID = "\u0000new";

/** Rendered beside a row whose `ifVersion` was stale — never as the server's sentence alone. */
export const VERSION_CONFLICT_COPY = "Changed by someone else since you loaded it.";

/** A `doc` store holds a JSON object or array; anything else is not a document. */
export const DOC_VALUE_COPY = "Enter a JSON object or array.";

/** R-7's client-side ceiling copy — the check runs before anything is sent. */
export const CSV_TOO_LARGE_COPY = "The file is larger than 5 MB.";

/**
 * One row's editable state: the id it is saved under (`entry.key`, or
 * {@linkcode NEW_ROW_ID}), the version the save guards with (`null` for a new
 * row) and the cell TEXT per declared column (never a parsed value — the text
 * is what the operator is editing, and re-serialising it on every keystroke
 * would fight their cursor).
 */
export interface RowDraft {
  id: string;
  version: number | null;
  cells: Record<string, string>;
}

/**
 * An entry's value read as a table row: the object the server stored, or `{}`
 * for anything that is not a plain object (a `null`, an array, a scalar from a
 * column set that has since changed).
 */
export function rowValueOf(entry: Entry): Record<string, unknown> {
  const value = entry.value;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The draft an entry starts as: its key, its version, and each declared column's text. */
export function draftFromEntry(entry: Entry, columns: readonly TableColumn[]): RowDraft {
  const row = rowValueOf(entry);
  const cells: Record<string, string> = {};
  for (const column of columns) cells[column.name] = serializeCell(column.type, row[column.name]);
  return { id: entry.key, version: entry.version, cells };
}

/**
 * The draft a brand-new row starts as: {@linkcode NEW_ROW_ID}, no version, and
 * each column seeded from its declared `default` (absent default = empty cell).
 */
export function newRowDraft(columns: readonly TableColumn[]): RowDraft {
  const cells: Record<string, string> = {};
  for (const column of columns) {
    cells[column.name] =
      column.default === undefined ? "" : serializeCell(column.type, column.default);
  }
  return { id: NEW_ROW_ID, version: null, cells };
}

/**
 * Which declared columns the operator actually changed, in DECLARED order.
 *
 * Declared order (not object order) so the answer is stable across browsers and
 * the row's Save button can decide "dirty" with one empty-array check. An
 * untouched draft is `[]`.
 */
export function dirtyColumns(
  draft: RowDraft,
  base: RowDraft,
  columns: readonly TableColumn[],
): string[] {
  const dirty: string[] = [];
  for (const column of columns) {
    if ((draft.cells[column.name] ?? "") !== (base.cells[column.name] ?? "")) {
      dirty.push(column.name);
    }
  }
  return dirty;
}

/**
 * The row body a Save sends, or the per-cell refusals that stop it.
 *
 * Every DECLARED column is parsed through {@linkcode parseCell} with its own
 * `required` flag: an absent value omits the key entirely (R-7's empty-cell
 * rule, so the host's default applies), a `string` cell keeps its text verbatim
 * and every other type is the JSON value the server expects — never the typed
 * text. Failures are keyed by column name so the caller renders them under the
 * offending cell.
 */
export function buildRowValue(
  draft: RowDraft,
  columns: readonly TableColumn[],
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const value: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const column of columns) {
    const parsed = parseCell(column.type, draft.cells[column.name] ?? "", column.required);
    if (parsed.ok) {
      if (parsed.value !== undefined) value[column.name] = parsed.value;
    } else {
      errors[column.name] = parsed.message;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * The `ttlSeconds` a save must resend so it does not CLEAR an existing expiry
 * (S-1: a PUT without `ttlSeconds` sets `expires_at = NULL`).
 *
 * `undefined` for an entry that never expires, for an unparseable timestamp and
 * for one already in the past — in all three cases sending nothing is correct
 * (and a non-positive TTL is not a TTL the host accepts). Rounded UP, so a save
 * one millisecond before the deadline does not shorten the entry's life.
 */
export function remainingTtlSeconds(expiresAt: string | null, nowMs: number): number | undefined {
  if (expiresAt === null) return undefined;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return undefined;
  const seconds = Math.ceil((ms - nowMs) / 1000);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Which request a draft implies: an INSERT (`POST entries`, no `ifVersion`) for
 * a row that does not exist yet, otherwise a PUT under the row's key guarded by
 * the version the operator loaded.
 *
 * `ttlSeconds` is present ONLY when the caller has one: it reaches the wire as
 * a defining key, and an explicit `undefined` would be indistinguishable from
 * "the caller measured nothing".
 */
export function rowWriteOf(
  draft: RowDraft,
  value: Record<string, unknown>,
  ttlSeconds: number | undefined,
):
  | { kind: "insert"; value: Record<string, unknown>; ttlSeconds?: number }
  | {
      kind: "put";
      key: string;
      value: Record<string, unknown>;
      ifVersion: number;
      ttlSeconds?: number;
    } {
  if (draft.id === NEW_ROW_ID) {
    return ttlSeconds === undefined
      ? { kind: "insert", value }
      : { kind: "insert", value, ttlSeconds };
  }
  const write = {
    kind: "put" as const,
    key: draft.id,
    value,
    ifVersion: draft.version ?? 0,
  };
  return ttlSeconds === undefined ? write : { ...write, ttlSeconds };
}

/**
 * The cell errors a refusal places, or `null` when it belongs somewhere else
 * (the form, a request-body field, a column this table does not declare).
 *
 * `null` is load-bearing: the grid renders `grid-error` exactly when this
 * returns `null`, so "the message shows in one slot" is a property of the
 * answer rather than of the caller's care.
 */
export function cellErrorsOf(
  loc: DataStoreErrorLocator,
  columns: readonly TableColumn[],
): Record<string, string> | null {
  const placement = errorPlacement(loc);
  if (placement.kind !== "cell") return null;
  if (!columns.some((column) => column.name === placement.column)) return null;
  return { [placement.column]: loc.message };
}

/**
 * Is this failure the optimistic-concurrency refusal — and nothing else?
 *
 * `409` alone is not enough: `entry_exists` and `store_exists` share the status
 * and neither is fixed by reloading, so both halves of the locator must agree.
 */
export function isVersionConflict(loc: DataStoreErrorLocator): boolean {
  return loc.status === 409 && loc.code === "version_conflict";
}

/**
 * A `doc` store's value from the editor's text: any JSON object or array.
 *
 * A scalar is refused rather than wrapped — the store's own `doc` shape is an
 * object/array (S-2), and the host would refuse `42` anyway; failing here means
 * the operator sees why without a round trip. `null` parses but is not a
 * document, so it is refused with the same sentence.
 */
export function parseDocText(
  text: string,
): { ok: true; value: object } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: DOC_VALUE_COPY };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, message: DOC_VALUE_COPY };
  }
  return { ok: true, value: parsed };
}

/**
 * A `kv` store's value from the editor's text.
 *
 * `string` is the one type whose text IS the value, empty string included (an
 * empty `string` entry is a real value, not an absent one), so it never passes
 * through {@linkcode parseCell} — which reads an empty cell as absent. Every
 * other type is parsed exactly as a table cell would be, `required` on, because
 * a kv entry always has a value.
 */
export function kvValueOf(
  type: ScalarType,
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (type === "string") return { ok: true, value: text };
  const parsed = parseCell(type, text, true);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, message: parsed.message };
}

/**
 * What a CSV import's `RawResponse` says to the operator.
 *
 * The host is the only parser (R-7): a `200` reports how many rows it took, and
 * a refusal is located rather than interpreted — a `row` becomes the operator's
 * own 1-based line (`csvLineOf`), the `column` is named when the host named one,
 * and everything else is the host's sentence verbatim.
 */
export function csvImportMessage(res: { status: number; text: string }): {
  ok: boolean;
  message: string;
} {
  if (res.status === 200) {
    let imported = 0;
    try {
      const body = JSON.parse(res.text) as { imported?: unknown };
      if (typeof body.imported === "number" && Number.isFinite(body.imported)) {
        imported = body.imported;
      }
    } catch {
      imported = 0;
    }
    return {
      ok: true,
      message: `Imported ${imported} row${imported === 1 ? "" : "s"}.`,
    };
  }
  const loc = locateRawResponseError(res);
  if (loc.row === undefined) return { ok: false, message: loc.message };
  const where = loc.column
    ? `Line ${csvLineOf(loc.row)}, column ${loc.column}`
    : `Line ${csvLineOf(loc.row)}`;
  return { ok: false, message: `${where}: ${loc.message}` };
}
