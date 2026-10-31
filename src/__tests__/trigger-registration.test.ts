// Run (from packages/ui): node --test src/__tests__/trigger-registration.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NEVER_FIRED,
  formatLastFire,
  registrationDisplay,
  subscriptionsByNode,
} from "../trigger-registration.ts";
import type { SubscriptionStatus, SubscriptionSummary } from "../types.ts";

const sub = (over: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
  id: "sub_1",
  appId: "cohost",
  triggerKey: "booking",
  workflowId: "wf_1",
  connectionId: "c1",
  status: "registered",
  nodeId: "T1",
  ...over,
});
const STATUSES: SubscriptionStatus[] = ["pending", "registered", "failed", "paused", "destroying"];

test("A2: every status has its own label (compared to each other)", () => {
  const labels = STATUSES.map((s) => registrationDisplay(sub({ status: s }), true)?.label);
  assert.ok(labels.every((l) => typeof l === "string" && l.length > 0));
  assert.equal(new Set(labels).size, STATUSES.length);
});

test("A2: failed shows lastError.message; other statuses never do", () => {
  const lastError = { code: "partner_down", message: "partner returned 503" };
  assert.equal(
    registrationDisplay(sub({ status: "failed", lastError }), true)?.error,
    lastError.message,
  );
  for (const s of STATUSES.filter((x) => x !== "failed")) {
    assert.equal(registrationDisplay(sub({ status: s, lastError }), true)?.error, null, s);
  }
  assert.equal(registrationDisplay(sub({ status: "failed", lastError: null }), true)?.error, null);
});

test("A2: never-fired is distinct from a set time", () => {
  const never = registrationDisplay(sub({ lastFireAt: null }), false)?.lastFire;
  const absent = registrationDisplay(sub(), false)?.lastFire;
  const set = registrationDisplay(sub({ lastFireAt: "2026-10-30T12:34:56Z" }), false)?.lastFire;
  assert.equal(never, NEVER_FIRED);
  assert.equal(absent, NEVER_FIRED);
  assert.notEqual(set, never);
  assert.match(set ?? "", /2026-10-30 12:34/);
  assert.equal(formatLastFire("garbage"), NEVER_FIRED);
});

test("A2: retry visible iff failed AND retry provided", () => {
  for (const s of STATUSES) {
    for (const can of [true, false]) {
      assert.equal(
        registrationDisplay(sub({ status: s }), can)?.retryVisible,
        s === "failed" && can,
        `${s}/${can}`,
      );
    }
  }
});

test("no status or no subscription => no display; byNode skips workflow-level subs", () => {
  assert.equal(registrationDisplay(undefined, true), null);
  assert.equal(registrationDisplay(sub({ status: undefined }), true), null);
  const m = subscriptionsByNode([
    sub(),
    sub({ id: "s2", nodeId: null }),
    sub({ id: "s3", nodeId: undefined }),
  ]);
  assert.deepEqual([...m.keys()], ["T1"]);
});
