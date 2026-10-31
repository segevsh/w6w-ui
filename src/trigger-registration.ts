// Pure display decision for a trigger node's bound Subscription
// (rfcs/trigger-protocol.md §Lifecycle "Subscription states", §Observability).
// No DOM and no React so the node test runner covers it directly.
import type { SubscriptionStatus, SubscriptionSummary } from "./types.ts";

export type RegistrationTone = "ok" | "pending" | "danger" | "muted";

export interface RegistrationDisplay {
  label: string;
  tone: RegistrationTone;
  /** `lastError.message`, only for a failed subscription that carries one. */
  error: string | null;
  /** Always set: a distinct "never fired" text when `lastFireAt` is null/absent/unparseable. */
  lastFire: string;
  /** True iff the subscription is `failed` AND the host can retry. */
  retryVisible: boolean;
}

const LABELS: Record<SubscriptionStatus, { label: string; tone: RegistrationTone }> = {
  registered: { label: "Registered", tone: "ok" },
  pending: { label: "Registering", tone: "pending" },
  failed: { label: "Registration failed", tone: "danger" },
  paused: { label: "Paused", tone: "muted" },
  destroying: { label: "Removing", tone: "muted" },
};

export const NEVER_FIRED = "Never fired";

/** UTC, minute precision, so the text is stable across locales and test hosts. */
export function formatLastFire(iso: string | null | undefined): string {
  if (!iso) return NEVER_FIRED;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return NEVER_FIRED;
  return `Last fired ${t.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Null when the summary has no known status (older server): the node shows no badge. */
export function registrationDisplay(
  sub: SubscriptionSummary | undefined,
  canRetry: boolean,
): RegistrationDisplay | null {
  if (!sub?.status) return null;
  const known = LABELS[sub.status];
  if (!known) return null;
  const failed = sub.status === "failed";
  return {
    label: known.label,
    tone: known.tone,
    error: failed ? (sub.lastError?.message ?? null) : null,
    lastFire: formatLastFire(sub.lastFireAt),
    retryVisible: failed && canRetry,
  };
}

/** nodeId -> subscription for the node-bound ones (a null `nodeId` is workflow-level). */
export function subscriptionsByNode(
  subs: readonly SubscriptionSummary[],
): Map<string, SubscriptionSummary> {
  const m = new Map<string, SubscriptionSummary>();
  for (const s of subs) if (s.nodeId) m.set(s.nodeId, s);
  return m;
}
