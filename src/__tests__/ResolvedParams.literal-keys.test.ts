// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/ResolvedParams.literal-keys.test.ts
//
// The Test tab's "what will be sent" rows show a Run script's code VERBATIM: the host never
// resolves `@w6w/script`'s `code`, so a `{{ }}` in it must not read as a resolved value.
import assert from "node:assert/strict";
import { test } from "node:test";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { ResolvedParams } = await import("../components/ResolvedParams.tsx");
type ActionParam = import("../types.ts").ActionParam;

const PARAMS: ActionParam[] = [{ key: "code", label: "Script", type: "code" }];
const CODE = "const n = '{{ nodes.a.output.n }}';\nreturn n;";
const STATE = { steps: { a: { output: { n: "USD,10000" } } } };

const render = (literalKeys?: string[]) =>
  renderToStaticMarkup(
    React.createElement(ResolvedParams, {
      params: PARAMS,
      values: { code: CODE },
      testStartState: STATE,
      literalKeys,
    }),
  );

test("a literal key renders its source text, no chip and no resolved value", () => {
  const html = render(["code"]);
  assert.ok(html.includes("{{ nodes.a.output.n }}"), html);
  assert.ok(!html.includes("w6w-expr-chip"), "no ref chip");
  assert.ok(!html.includes("USD,10000"), "the upstream value is not spliced in");
});

test("without literalKeys the same value resolves as before (a chip and the value)", () => {
  const html = render();
  assert.ok(html.includes("w6w-expr-chip"));
  assert.ok(html.includes("USD,10000"));
});
