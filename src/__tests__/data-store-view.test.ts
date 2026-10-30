import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
  CELL_PROBLEM_COPY,
  CSV_MAX_BYTES,
  CSV_TOO_LARGE_COPY,
  type CellProblem,
  DATA_STORE_ERROR_FALLBACK,
  DATA_STORE_KINDS,
  DATA_STORE_KIND_LABEL,
  DATA_STORE_NETWORK_ERROR,
  DOC_VALUE_COPY,
  type DataStore,
  type DataStoreErrorLocator,
  type Entry,
  NEW_ROW_ID,
  type RowDraft,
  SCALAR_TYPES,
  type ScalarType,
  type TableColumn,
  VERSION_CONFLICT_COPY,
  buildRowValue,
  cellErrorsOf,
  csvFilenameOf,
  csvImportMessage,
  csvLineOf,
  dirtyColumns,
  draftFromEntry,
  errorPlacement,
  isCellValue,
  isVersionConflict,
  kvValueOf,
  kvValueTypeOf,
  locateDataStoreError,
  locateRawResponseError,
  newRowDraft,
  parseCell,
  parseDocText,
  remainingTtlSeconds,
  rowValueOf,
  rowWriteOf,
  serializeCell,
  tableSchemaOf,
} from "../data-stores/data-store-view.ts";

// ── ported from Studio data-cells.test.ts (5127673) ──
{
  /** `parseCell`'s ok arm, for the assertions below. */
  function ok(value: unknown) {
    return { ok: true, value };
  }

  /** `parseCell`'s refusal arm, message included. */
  function refused(problem: CellProblem) {
    return { ok: false, problem, message: CELL_PROBLEM_COPY[problem] };
  }

  // A1 — round trip: the text a cell shows for a value must parse back to that
  // same value, for every scalar type. `-0` is excluded from the fixtures on
  // purpose: `String(-0)` is `"0"`, so it is the one number that cannot survive
  // a text round trip.
  const VALID: Record<ScalarType, unknown[]> = {
    string: ["plain", " a ", "line\nbreak", ""],
    number: [0, 1.5, -42, 1000, 0.25, -0.001],
    integer: [0, -7, 42, 9007199254740991],
    boolean: [true, false],
    date: ["2024-02-29", "0000-02-29", "1999-12-31"],
    datetime: [
      "2026-01-31T09:30:00Z",
      "2024-02-29T23:59:59+23:59",
      "2024-01-01T00:00:00.500-05:00",
    ],
  };

  for (const type of Object.keys(VALID) as ScalarType[]) {
    test(`parseCell(${type}, serializeCell(${type}, v), false) round-trips every valid fixture`, () => {
      for (const value of VALID[type]) {
        if (value === "") {
          // An empty string is the ABSENT cell for every type, string included.
          assert.deepEqual(parseCell(type, serializeCell(type, value), false), ok(undefined));
          continue;
        }
        assert.deepEqual(
          parseCell(type, serializeCell(type, value), false),
          ok(value),
          `${type} value ${JSON.stringify(value)} did not survive the round trip`,
        );
      }
    });
  }

  // The grammar each type refuses. Every entry is a value the host answers 400
  // for, so accepting one would make the grid's Save button a trap.
  const REFUSALS: Record<ScalarType, string[]> = {
    string: [],
    number: ["1,000", "0x10", "NaN", "Infinity", "01", "+1", ".5", "1."],
    integer: ["1.5", "1.0", "1e3", "9007199254740993", "0x10", "- 1"],
    boolean: ["TRUE", "1", "yes", "False"],
    date: [
      "2023-02-29",
      "2024-04-31",
      "2024-13-01",
      "2024-4-1",
      "2024-00-10",
      "2024-01-00",
      "24-01-01",
    ],
    datetime: [
      "2026-01-31T09:30:00", // no offset at all
      "2026-01-31 09:30:00Z", // space separator
      "2026-01-31t09:30:00Z", // lowercase t
      "2026-01-31T09:30:00z", // lowercase z
      "2026-01-31T24:00:00Z", // hour 24
      "2026-01-31T09:60:00Z", // minute 60
      "2026-01-31T09:30:60Z", // second 60
      "2026-01-31T09:30:00+24:00", // offset hour 24
      "2026-01-31T09:30:00+05:60", // offset minute 60
      "2023-02-29T09:30:00Z", // not a real day
    ],
  };

  const PROBLEM_OF: Record<ScalarType, CellProblem> = {
    string: "required",
    number: "not_a_number",
    integer: "not_an_integer",
    boolean: "not_a_boolean",
    date: "not_a_date",
    datetime: "not_a_datetime",
  };

  for (const type of Object.keys(REFUSALS) as ScalarType[]) {
    for (const text of REFUSALS[type]) {
      test(`parseCell(${type}, ${JSON.stringify(text)}, false) is refused as ${PROBLEM_OF[type]}`, () => {
        assert.deepEqual(parseCell(type, text, false), refused(PROBLEM_OF[type]));
      });
    }
  }

  // R-7's empty-cell rule: an empty cell is ABSENT unless the column is
  // required, and "empty" means empty AFTER trim for every type.
  for (const type of Object.keys(VALID) as ScalarType[]) {
    test(`parseCell(${type}, "", false) is absent and ("", true) is required`, () => {
      assert.deepEqual(parseCell(type, "", false), ok(undefined));
      assert.deepEqual(parseCell(type, "   ", false), ok(undefined));
      assert.deepEqual(parseCell(type, "", true), refused("required"));
      assert.deepEqual(parseCell(type, " \t ", true), refused("required"));
    });
  }

  // A string cell keeps what the operator typed — trimming it would silently
  // edit the value that gets stored (and the server stores it verbatim).
  test('parseCell("string", " a ", false) keeps the text verbatim', () => {
    assert.deepEqual(parseCell("string", " a ", false), ok(" a "));
    assert.deepEqual(parseCell("string", "a b", true), ok("a b"));
  });

  // And the other types trim for the comparison but return the trimmed text.
  test("date/datetime values are returned trimmed, not as typed", () => {
    assert.deepEqual(parseCell("date", " 2024-02-29 ", false), ok("2024-02-29"));
    assert.deepEqual(
      parseCell("datetime", " 2026-01-31T09:30:00Z ", false),
      ok("2026-01-31T09:30:00Z"),
    );
  });

  test("number and integer values are returned as numbers, including exponent and fraction forms", () => {
    assert.deepEqual(parseCell("number", "1e3", false), ok(1000));
    assert.deepEqual(parseCell("number", "-0.5", false), ok(-0.5));
    assert.deepEqual(parseCell("number", "007", false), refused("not_a_number"));
    assert.deepEqual(parseCell("integer", "-42", false), ok(-42));
  });

  // `Date.UTC` maps years 0–99 to 19xx, so a `Date`-based check would accept
  // `"0050-01-01"` as 1950 or reject a real leap day in year 0. The pure rule
  // accepts `0000-02-29` (year 0 IS a leap year: divisible by 400) and rejects
  // `0000-02-30`.
  test("dates are checked by the Gregorian rule, not via Date", () => {
    assert.deepEqual(parseCell("date", "0000-02-29", false), ok("0000-02-29"));
    assert.deepEqual(parseCell("date", "0000-02-30", false), refused("not_a_date"));
    assert.deepEqual(parseCell("date", "1900-02-29", false), refused("not_a_date"));
    assert.deepEqual(parseCell("date", "2000-02-29", false), ok("2000-02-29"));
  });

  // Every problem's copy is the one sentence the grid renders — pinned as a
  // whole table so a reworded message is a red test, not a silent UI change.
  test("CELL_PROBLEM_COPY is the exact seven-entry copy table", () => {
    assert.deepEqual(CELL_PROBLEM_COPY, {
      required: "Required.",
      not_a_number: "Enter a number.",
      not_an_integer: "Enter a whole number.",
      not_a_boolean: "Enter true or false.",
      not_a_date: "Enter a date as YYYY-MM-DD.",
      not_a_datetime: "Enter a date-time like 2026-01-31T09:30:00Z.",
    });
  });

  test("every refusal carries its problem's copy verbatim", () => {
    const cases: Array<[ScalarType, string, CellProblem]> = [
      ["string", "", "required"],
      ["number", "abc", "not_a_number"],
      ["integer", "1.5", "not_an_integer"],
      ["boolean", "TRUE", "not_a_boolean"],
      ["date", "2023-02-29", "not_a_date"],
      ["datetime", "2026-01-31T09:30:00", "not_a_datetime"],
    ];
    for (const [type, text, problem] of cases) {
      // `required` is only ever produced by the required-flag arm (R-7).
      const result = parseCell(type, text, problem === "required");
      assert.equal(result.ok, false, `${type} ${JSON.stringify(text)} must be refused`);
      if (result.ok) continue;
      assert.equal(result.problem, problem);
      assert.equal(result.message, CELL_PROBLEM_COPY[problem]);
    }
  });

  test("serializeCell renders absent values as the empty cell and JSON-ish values as JSON", () => {
    for (const type of Object.keys(VALID) as ScalarType[]) {
      assert.equal(serializeCell(type, undefined), "");
      assert.equal(serializeCell(type, null), "");
    }
    assert.equal(serializeCell("number", 1.5), "1.5");
    assert.equal(serializeCell("integer", -3), "-3");
    assert.equal(serializeCell("boolean", true), "true");
    assert.equal(serializeCell("boolean", false), "false");
    assert.equal(serializeCell("string", " a "), " a ");
    assert.equal(serializeCell("string", 7), "7");
    assert.equal(serializeCell("string", { a: 1 }), '{"a":1}');
    assert.equal(serializeCell("number", Number.POSITIVE_INFINITY), "null");
  });

  // `isCellValue` applies the SAME rules to an already-typed JSON value: the
  // grid marks a server-returned row this refuses before the operator saves it.
  test("isCellValue accepts and refuses the same values per type", () => {
    assert.equal(isCellValue("string", ""), true);
    assert.equal(isCellValue("string", 7), false);
    assert.equal(isCellValue("number", 1.5), true);
    assert.equal(isCellValue("number", "1.5"), false);
    assert.equal(isCellValue("number", Number.NaN), false);
    assert.equal(isCellValue("number", Number.POSITIVE_INFINITY), false);
    assert.equal(isCellValue("integer", 3), true);
    assert.equal(isCellValue("integer", 3.5), false);
    assert.equal(isCellValue("integer", 2 ** 53), false);
    assert.equal(isCellValue("boolean", true), true);
    assert.equal(isCellValue("boolean", "true"), false);
    assert.equal(isCellValue("date", "2024-02-29"), true);
    assert.equal(isCellValue("date", "2024-02-30"), false);
    assert.equal(isCellValue("date", "2024-2-9"), false);
    assert.equal(isCellValue("datetime", "2026-01-31T09:30:00Z"), true);
    assert.equal(isCellValue("datetime", "2026-01-31T09:30:00"), false);
    assert.equal(isCellValue("datetime", 1_700_000_000), false);
  });
}

// ── ported from Studio data-grid.test.ts (5127673) ──
{
  /** The D5 fixture's declared columns: a required string key, an integer, a date. */
  const COLUMNS: readonly TableColumn[] = [
    { name: "name", type: "string", required: true },
    { name: "age", type: "integer", required: false },
    { name: "born", type: "date", required: false },
  ];

  /** The `ann` row the grid fixture serves (v5): the base draft of every mutation test. */
  const ANN: Entry = {
    key: "ann",
    value: { name: "ann", age: 6, born: "1990-01-02" },
    version: 5,
    sizeBytes: 34,
    expiresAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };

  /** A draft with `cells` overlaid on `ann`'s own — the operator's edit. */
  function edited(overrides: Record<string, string>): RowDraft {
    const base = draftFromEntry(ANN, COLUMNS);
    return { ...base, cells: { ...base.cells, ...overrides } };
  }

  // ── the pinned copy ──────────────────────────────────────────────────────────

  test("the four copies are the pinned sentences", () => {
    assert.equal(NEW_ROW_ID, "\u0000new");
    assert.equal(VERSION_CONFLICT_COPY, "Changed by someone else since you loaded it.");
    assert.equal(DOC_VALUE_COPY, "Enter a JSON object or array.");
    assert.equal(CSV_TOO_LARGE_COPY, "The file is larger than 5 MB.");
  });

  // ── drafts ───────────────────────────────────────────────────────────────────

  test("rowValueOf reads a stored object and refuses everything that is not one", () => {
    assert.deepEqual(rowValueOf(ANN), {
      name: "ann",
      age: 6,
      born: "1990-01-02",
    });
    assert.deepEqual(rowValueOf({ ...ANN, value: null }), {});
    assert.deepEqual(rowValueOf({ ...ANN, value: [1, 2] }), {});
    assert.deepEqual(rowValueOf({ ...ANN, value: 7 }), {});
  });

  test("draftFromEntry carries key, version and each declared column's text", () => {
    assert.deepEqual(draftFromEntry(ANN, COLUMNS), {
      id: "ann",
      version: 5,
      cells: { name: "ann", age: "6", born: "1990-01-02" },
    });
  });

  test("newRowDraft is NEW_ROW_ID with no version and the declared defaults", () => {
    const columns: readonly TableColumn[] = [
      { name: "name", type: "string", required: true },
      { name: "n", type: "integer", required: false, default: 3 },
      { name: "flag", type: "boolean", required: false },
    ];
    assert.deepEqual(newRowDraft(columns), {
      id: NEW_ROW_ID,
      version: null,
      cells: { name: "", n: "3", flag: "" },
    });
  });

  // ── dirtyColumns ─────────────────────────────────────────────────────────────

  test("dirtyColumns: an untouched draft is empty, one edited cell is that column", () => {
    const base = draftFromEntry(ANN, COLUMNS);
    assert.deepEqual(dirtyColumns(base, base, COLUMNS), []);
    assert.deepEqual(dirtyColumns(edited({ age: "7" }), base, COLUMNS), ["age"]);
  });

  test("dirtyColumns reports edits in DECLARED order, not edit order", () => {
    const base = draftFromEntry(ANN, COLUMNS);
    assert.deepEqual(dirtyColumns(edited({ born: "2000-01-01", age: "8" }), base, COLUMNS), [
      "age",
      "born",
    ]);
  });

  // ── buildRowValue ────────────────────────────────────────────────────────────

  test("buildRowValue: an integer cell is a NUMBER on the wire, never its text", () => {
    assert.deepEqual(buildRowValue(edited({ age: "7" }), COLUMNS), {
      ok: true,
      value: { name: "ann", age: 7, born: "1990-01-02" },
    });
  });

  test("buildRowValue: an integer cell of '4.5' fails on that column ONLY", () => {
    const built = buildRowValue(edited({ age: "4.5" }), COLUMNS);
    assert.equal(built.ok, false);
    assert.deepEqual(Object.keys((built as { ok: false; errors: Record<string, string> }).errors), [
      "age",
    ]);
  });

  test("buildRowValue: a required column left empty is an error on that column", () => {
    const built = buildRowValue(edited({ name: "" }), COLUMNS);
    assert.equal(built.ok, false);
    assert.ok("name" in (built as { ok: false; errors: Record<string, string> }).errors);
  });

  test("buildRowValue: an empty NON-required cell omits its key entirely", () => {
    assert.deepEqual(buildRowValue(edited({ age: "", born: "" }), COLUMNS), {
      ok: true,
      value: { name: "ann" },
    });
  });

  test("buildRowValue: a date that is not a calendar day is refused", () => {
    const built = buildRowValue(edited({ born: "2026-02-30" }), COLUMNS);
    assert.equal(built.ok, false);
    assert.ok("born" in (built as { ok: false; errors: Record<string, string> }).errors);
  });

  // ── remainingTtlSeconds ──────────────────────────────────────────────────────

  test("remainingTtlSeconds: null, unparseable and past all say 'send nothing'", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    assert.equal(remainingTtlSeconds(null, now), undefined);
    assert.equal(remainingTtlSeconds("not a timestamp", now), undefined);
    assert.equal(remainingTtlSeconds("2025-12-31T23:59:59Z", now), undefined);
    assert.equal(remainingTtlSeconds("2026-01-01T00:00:00Z", now), undefined);
  });

  test("remainingTtlSeconds: a live expiry rounds UP to whole seconds", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    assert.equal(remainingTtlSeconds("2026-01-01T00:10:00Z", now), 600);
    assert.equal(remainingTtlSeconds("2026-01-01T00:00:01.500Z", now), 2);
  });

  // ── rowWriteOf ───────────────────────────────────────────────────────────────

  test("rowWriteOf: a new row is an insert with NO ifVersion", () => {
    const write = rowWriteOf(newRowDraft(COLUMNS), { name: "zed" }, undefined);
    assert.deepEqual(write, { kind: "insert", value: { name: "zed" } });
    assert.equal("ifVersion" in write, false);
  });

  test("rowWriteOf: an existing row is a put guarded by the version it was loaded at", () => {
    const draft = draftFromEntry(ANN, COLUMNS);
    assert.deepEqual(rowWriteOf(draft, { name: "ann" }, undefined), {
      kind: "put",
      key: "ann",
      value: { name: "ann" },
      ifVersion: 5,
    });
  });

  test("rowWriteOf: ttlSeconds is ABSENT when undefined and carried when measured", () => {
    const draft = draftFromEntry(ANN, COLUMNS);
    assert.equal("ttlSeconds" in rowWriteOf(draft, {}, undefined), false);
    assert.equal("ttlSeconds" in rowWriteOf(newRowDraft(COLUMNS), {}, undefined), false);
    assert.deepEqual(rowWriteOf(draft, {}, 600), {
      kind: "put",
      key: "ann",
      value: {},
      ifVersion: 5,
      ttlSeconds: 600,
    });
    assert.deepEqual(rowWriteOf(newRowDraft(COLUMNS), {}, 60), {
      kind: "insert",
      value: {},
      ttlSeconds: 60,
    });
  });

  // ── cellErrorsOf ─────────────────────────────────────────────────────────────

  test("cellErrorsOf: a declared column places the message on that cell", () => {
    const loc: DataStoreErrorLocator = {
      status: 400,
      code: "invalid_value",
      field: "value",
      column: "age",
      message: "age must be an integer",
    };
    assert.deepEqual(cellErrorsOf(loc, COLUMNS), {
      age: "age must be an integer",
    });
  });

  test("cellErrorsOf: an undeclared column, or a field-only locator, is null", () => {
    assert.equal(cellErrorsOf({ status: 400, message: "nope", column: "nope" }, COLUMNS), null);
    assert.equal(
      cellErrorsOf({ status: 400, message: "bad value", field: "value" }, COLUMNS),
      null,
    );
    assert.equal(cellErrorsOf({ status: 500, message: "boom" }, COLUMNS), null);
  });

  // ── isVersionConflict ────────────────────────────────────────────────────────

  test("isVersionConflict: only 409 + version_conflict, never another 409", () => {
    assert.equal(
      isVersionConflict({
        status: 409,
        code: "version_conflict",
        message: "stale",
      }),
      true,
    );
    assert.equal(
      isVersionConflict({
        status: 409,
        code: "entry_exists",
        message: "exists",
      }),
      false,
    );
    assert.equal(
      isVersionConflict({
        status: 400,
        code: "version_conflict",
        message: "?",
      }),
      false,
    );
  });

  // ── parseDocText ─────────────────────────────────────────────────────────────

  test("parseDocText: objects and arrays are accepted, scalars are refused", () => {
    assert.deepEqual(parseDocText('{"x":1}'), { ok: true, value: { x: 1 } });
    assert.deepEqual(parseDocText("[]"), { ok: true, value: [] });
    assert.deepEqual(parseDocText("{}"), { ok: true, value: {} });
    assert.deepEqual(parseDocText("42"), {
      ok: false,
      message: DOC_VALUE_COPY,
    });
    assert.deepEqual(parseDocText("x"), { ok: false, message: DOC_VALUE_COPY });
    assert.deepEqual(parseDocText("null"), {
      ok: false,
      message: DOC_VALUE_COPY,
    });
  });

  // ── kvValueOf ────────────────────────────────────────────────────────────────

  test("kvValueOf: a string value keeps its text verbatim, the empty string included", () => {
    assert.deepEqual(kvValueOf("string", ""), { ok: true, value: "" });
    assert.deepEqual(kvValueOf("string", " 42 "), { ok: true, value: " 42 " });
  });

  test("kvValueOf: a typed value is the JSON value, and bad text sends nothing", () => {
    assert.deepEqual(kvValueOf("integer", "42"), { ok: true, value: 42 });
    assert.deepEqual(kvValueOf("boolean", "true"), { ok: true, value: true });
    const refused = kvValueOf("integer", "4.5");
    assert.equal(refused.ok, false);
    assert.equal(typeof (refused as { ok: false; message: string }).message, "string");
  });

  // ── csvImportMessage ─────────────────────────────────────────────────────────

  test("csvImportMessage: a 200 reports the imported row count", () => {
    assert.deepEqual(csvImportMessage({ status: 200, text: '{"imported":2}' }), {
      ok: true,
      message: "Imported 2 rows.",
    });
    assert.deepEqual(csvImportMessage({ status: 200, text: '{"imported":1}' }), {
      ok: true,
      message: "Imported 1 row.",
    });
  });

  test("csvImportMessage: a bad row + column becomes the operator's own line number", () => {
    const res = {
      status: 400,
      text: JSON.stringify({
        error: {
          code: "invalid_value",
          message: "age must be an integer",
          row: 3,
          column: "age",
        },
      }),
    };
    const message = csvImportMessage(res);
    assert.equal(message.ok, false);
    assert.ok(
      message.message.startsWith("Line 5, column age:"),
      `expected the line-5 copy, got ${message.message}`,
    );
  });

  test("csvImportMessage: a row with no column still names the line; a status 0 is the network copy", () => {
    const rowOnly = csvImportMessage({
      status: 400,
      text: JSON.stringify({
        error: { code: "invalid_value", message: "bad row", row: 0 },
      }),
    });
    assert.equal(rowOnly.message, "Line 2: bad row");
    const offline = csvImportMessage({ status: 0, text: "" });
    assert.equal(offline.ok, false);
    assert.equal(offline.message, "Could not reach the server.");
  });
}

// ── ported from Studio data-store-errors.test.ts (5127673) ──
{
  /** An `ApiError`-shaped throw: the SDK keeps the parsed body on `.raw`. */
  function apiError(raw: unknown, status = 400, message = "Bad Request") {
    return { name: "ApiError", status, message, raw };
  }

  test("an envelope with field AND column locates the cell, not the field", () => {
    const loc = locateDataStoreError(
      apiError({
        error: {
          code: "invalid_value",
          message: "m",
          field: "value",
          column: "age",
        },
      }),
    );
    assert.deepEqual(loc, {
      message: "m",
      status: 400,
      code: "invalid_value",
      field: "value",
      column: "age",
    });
    assert.deepEqual(errorPlacement(loc), { kind: "cell", column: "age" });
  });

  test("an envelope with only field locates the field", () => {
    const loc = locateDataStoreError(
      apiError({
        error: {
          code: "invalid_schema",
          message: "schema bad",
          field: "schema",
        },
      }),
    );
    assert.deepEqual(loc, {
      message: "schema bad",
      status: 400,
      code: "invalid_schema",
      field: "schema",
    });
    assert.deepEqual(errorPlacement(loc), { kind: "field", field: "schema" });
  });

  test("an envelope with neither locates the form", () => {
    const loc = locateDataStoreError(
      apiError({ error: { code: "internal", message: "boom" } }, 500),
    );
    assert.deepEqual(loc, { message: "boom", status: 500, code: "internal" });
    assert.deepEqual(errorPlacement(loc), { kind: "form" });
  });

  // `row` is the host's 0-based DATA row: line 1 of the CSV is the header, so
  // data row 3 is the operator's line 5. A 1-based locator here would point the
  // operator at the wrong line of their own file.
  test("row stays 0-based and csvLineOf adds two for the CSV line number", () => {
    const loc = locateDataStoreError(
      apiError({
        error: {
          code: "invalid_value",
          message: "bad row",
          row: 3,
          column: "age",
        },
      }),
    );
    assert.equal(loc.row, 3);
    assert.equal(csvLineOf(3), 5);
    assert.equal(csvLineOf(0), 2);
    assert.deepEqual(errorPlacement(loc), {
      kind: "cell",
      column: "age",
      row: 3,
    });
  });

  test("a non-row is dropped: negative, fractional and string rows never reach the page", () => {
    for (const row of [-1, 1.5, "3", null]) {
      const loc = locateDataStoreError(
        apiError({
          error: { code: "invalid_value", message: "m", row, column: "age" },
        }),
      );
      assert.equal(loc.row, undefined, `row ${JSON.stringify(row)} must be dropped`);
    }
  });

  test("empty or non-string code/field/column/message are dropped", () => {
    const loc = locateDataStoreError(
      apiError(
        { error: { code: "", message: "", field: "", column: "", row: 0 } },
        409,
        "Conflict",
      ),
    );
    // The envelope's empty message falls through to the error's own message.
    assert.deepEqual(loc, { message: "Conflict", status: 409, row: 0 });
  });

  test("with no readable message anywhere the fallback sentence is used", () => {
    assert.deepEqual(locateDataStoreError(apiError({ error: { code: "x" } }, 418, "")), {
      message: DATA_STORE_ERROR_FALLBACK,
      status: 418,
      code: "x",
    });
  });

  test("locateRawResponseError: status 0 is the transport's own network_error", () => {
    const loc = locateRawResponseError({ status: 0, text: "" });
    assert.deepEqual(loc, {
      status: 0,
      code: "network_error",
      message: DATA_STORE_NETWORK_ERROR,
    });
    assert.deepEqual(errorPlacement(loc), { kind: "form" });
  });

  test("locateRawResponseError: a JSON body with row and column locates the CSV cell", () => {
    const loc = locateRawResponseError({
      status: 400,
      text: JSON.stringify({
        error: {
          code: "invalid_value",
          message: "bad cell",
          row: 2,
          column: "age",
        },
      }),
    });
    assert.deepEqual(loc, {
      message: "bad cell",
      status: 400,
      code: "invalid_value",
      row: 2,
      column: "age",
    });
    assert.deepEqual(errorPlacement(loc), {
      kind: "cell",
      column: "age",
      row: 2,
    });
    assert.equal(csvLineOf(2), 4);
  });

  test("locateRawResponseError: a non-JSON body is the fallback, never a parse throw", () => {
    assert.deepEqual(locateRawResponseError({ status: 502, text: "<html>" }), {
      status: 502,
      message: DATA_STORE_ERROR_FALLBACK,
    });
    assert.deepEqual(locateRawResponseError({ status: 500, text: "" }), {
      status: 500,
      message: DATA_STORE_ERROR_FALLBACK,
    });
    // Parseable JSON that is not an envelope contributes nothing but its status.
    assert.deepEqual(locateRawResponseError({ status: 400, text: "42" }), {
      status: 400,
      message: DATA_STORE_ERROR_FALLBACK,
    });
  });

  test("neither function throws for any input", () => {
    const inputs: unknown[] = [null, undefined, "x", 42, true, {}, [], { raw: null }, { raw: "x" }];
    for (const input of inputs) {
      const loc = locateDataStoreError(input);
      assert.equal(typeof loc.message, "string");
      assert.ok(loc.message.length > 0);
      assert.doesNotThrow(() => errorPlacement(loc));
    }
    for (const res of [null, undefined, { status: 200 }, { status: "0", text: 7 }]) {
      assert.doesNotThrow(() =>
        locateRawResponseError(res as unknown as { status: number; text: string }),
      );
    }
  });

  // A hostile accessor must not escape: the thing in a `catch` is `unknown`, and
  // a locator that threw would replace the server's message with a blank page.
  test("a body whose getters throw still yields the fallback", () => {
    const hostile = {
      status: 500,
      get raw(): unknown {
        throw new Error("no");
      },
    };
    assert.deepEqual(locateDataStoreError(hostile), {
      message: DATA_STORE_ERROR_FALLBACK,
    });
  });

  test("errorPlacement never prefers field over column", () => {
    assert.deepEqual(errorPlacement({ message: "m", field: "value", column: "price" }), {
      kind: "cell",
      column: "price",
    });
    assert.deepEqual(errorPlacement({ message: "m" }), { kind: "form" });
    assert.deepEqual(errorPlacement({ message: "m", field: "name" }), {
      kind: "field",
      field: "name",
    });
  });

  test("the two copy constants are the exact sentences the page renders", () => {
    assert.equal(DATA_STORE_ERROR_FALLBACK, "The request failed.");
    assert.equal(DATA_STORE_NETWORK_ERROR, "Could not reach the server.");
  });
}

// ── cases added by the lift ──
{
  const store = (over: Partial<DataStore>): DataStore => ({
    id: "ds_1",
    name: "orders",
    kind: "kv",
    description: "",
    project: "p1",
    schema: {},
    entryCount: 0,
    sizeBytes: 0,
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  });

  test("constants: closed vocabularies, labels and the CSV ceiling", () => {
    assert.deepEqual([...DATA_STORE_KINDS], ["kv", "doc", "table"]);
    assert.deepEqual(
      [...SCALAR_TYPES],
      ["string", "number", "integer", "boolean", "date", "datetime"],
    );
    assert.equal(CSV_MAX_BYTES, 5_242_880);
    assert.deepEqual(DATA_STORE_KIND_LABEL, {
      kv: "Key-value",
      doc: "Document",
      table: "Table",
    });
  });

  test("kvValueTypeOf: declared scalar wins, anything else is string", () => {
    assert.equal(kvValueTypeOf(store({ schema: { valueType: "integer" } })), "integer");
    assert.equal(kvValueTypeOf(store({ schema: { valueType: "blob" } })), "string");
    assert.equal(kvValueTypeOf(store({ schema: { valueType: 7 } })), "string");
    assert.equal(kvValueTypeOf(store({})), "string");
  });

  test("tableSchemaOf: null unless a table with a column array; key only when a string", () => {
    assert.equal(tableSchemaOf(store({ kind: "kv", schema: { columns: [] } })), null);
    assert.equal(tableSchemaOf(store({ kind: "table", schema: {} })), null);
    assert.equal(tableSchemaOf(store({ kind: "table", schema: { columns: "x" } })), null);
    const cols = [{ name: "a", type: "string", required: true }];
    assert.deepEqual(tableSchemaOf(store({ kind: "table", schema: { columns: cols } })), {
      columns: cols,
    });
    assert.deepEqual(tableSchemaOf(store({ kind: "table", schema: { columns: cols, key: "a" } })), {
      columns: cols,
      key: "a",
    });
  });

  test("csvFilenameOf: header filename, else <name>.csv", () => {
    assert.equal(csvFilenameOf('attachment; filename="x.csv"', "orders"), "x.csv");
    assert.equal(csvFilenameOf("attachment", "orders"), "orders.csv");
    assert.equal(csvFilenameOf(null, "orders"), "orders.csv");
    assert.equal(csvFilenameOf('attachment; filename=""', "orders"), "orders.csv");
  });

  test("rowWriteOf: a put whose draft has no version sends ifVersion 0", () => {
    const draft: RowDraft = {
      id: "k1",
      version: undefined,
      cells: {},
    } as unknown as RowDraft;
    const w = rowWriteOf(draft, { a: 1 }, undefined);
    assert.equal(w.kind, "put");
    assert.equal((w as { ifVersion: number }).ifVersion, 0);
    assert.equal("ttlSeconds" in w, false);
  });

  test("the util module is data-free: relative imports only, no fetch", () => {
    const dir = new URL("../data-stores/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    assert.ok(files.includes("data-store-view.ts"));
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), "utf8");
      assert.equal(
        /^\s*(import|export)\b.*\bfrom\s+"[^.]/m.test(src),
        false,
        `${f}: non-relative import`,
      );
      const code = src
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join("\n");
      assert.equal(/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(code), false, `${f}: network use`);
    }
  });
}
