// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.self-exclusion.test.ts
//
// I-1: a step being edited — or drafted in the add-step builder, where
// `editingId` is null and every node is offered — must not list its OWN
// outputs as rail sources.
import assert from "node:assert/strict";
import { test } from "node:test";
import { excludeSelfStep } from "../components/ExpressionOptions.tsx";
import { upstreamStateSources } from "../step-preview-state.ts";

const step = (id: string) => ({
  id,
  type: "step",
  position: { x: 0, y: 0 },
  data: { step: { id, uses: { app: "acme", action: "do" } }, isInternal: false },
});

test("builder state (editingId null) offers the draft; excludeSelfStep removes it", () => {
  // biome-ignore lint/suspicious/noExplicitAny: minimal node fixtures
  const nodes = [step("a"), step("draft_1")] as any;
  const raw = upstreamStateSources(null, nodes, []).steps.map((s) => s.id);
  assert.deepEqual(raw, ["a", "draft_1"]);
  const ids = excludeSelfStep(upstreamStateSources(null, nodes, []).steps, "draft_1").map(
    (s) => s.id,
  );
  assert.deepEqual(ids, ["a"]);
});

test("no self id leaves sources untouched", () => {
  const src = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(excludeSelfStep(src, null), src);
  assert.deepEqual(excludeSelfStep(src, undefined), src);
});
