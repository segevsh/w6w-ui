import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "@w6w/expr";
import { conditionOperandText, conditionOperandValue } from "../condition-editor.ts";

test("comparison operands preserve scalar types without a type selector", () => {
  for (const value of [
    true,
    false,
    1,
    1.5,
    0,
    null,
    "",
    "1",
    "true",
    "null",
    "hook-1",
    "{{ foreach.item.id }}",
  ]) {
    assert.deepEqual(conditionOperandValue(conditionOperandText(value)), value);
  }
});

test("expression picker operands remain executable references on both sides", () => {
  const left = conditionOperandValue("{{ foreach.item.id }}");
  const right = conditionOperandValue("{{ const.target }}");
  assert.equal(
    evaluate(
      { "===": [left, right] },
      { foreach: { item: { id: "hook-1" } }, const: { target: "hook-1" } },
    ),
    true,
  );
  assert.equal(
    evaluate({ "===": [left, conditionOperandValue("1")] }, { foreach: { item: { id: "1" } } }),
    false,
  );
  const custom = { ">": [{ var: "trigger.event.value" }, 2] };
  assert.deepEqual(conditionOperandValue(conditionOperandText(custom)), custom);
});
