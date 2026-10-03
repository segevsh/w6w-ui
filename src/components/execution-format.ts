/**
 * Pure duration/time formatters for the execution-history family, kept in
 * their own module so they carry no React and can be unit-tested on their own
 * — the same split `server-resources-format.ts` establishes.
 *
 * Both are TOTAL: a duration that was never measured (a still-running or
 * queued run) is rendered as an em dash, never as `0 ms` — "unknown" must not
 * read as "instant".
 */

/** What an unmeasured/unknown value renders as. Never `0`. */
const UNKNOWN = "—";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;

/**
 * A run duration as a short human string: whole milliseconds below a second
 * (`999 ms`), one decimal place in seconds below a minute (`1.5 s`), and
 * `2m 5s` from a minute up. `null`/`undefined` (nothing measured), `NaN` and
 * negatives are all `—`.
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return UNKNOWN;
  if (ms < MS_PER_SECOND) return `${Math.round(ms)} ms`;
  if (ms < MS_PER_MINUTE) return `${(ms / MS_PER_SECOND).toFixed(1)} s`;
  return `${Math.floor(ms / MS_PER_MINUTE)}m ${Math.round((ms % MS_PER_MINUTE) / MS_PER_SECOND)}s`;
}

/**
 * An ISO-8601 instant as a short, locale-formatted date+time (`Sep 22, 2026,
 * 10:00 AM` under the default locale). The locale is the HOST's
 * (`undefined`), so the string follows the viewer's own settings rather than
 * baking one in. A string `Date` cannot parse is returned UNCHANGED — an
 * unrenderable timestamp is shown as the wire value, never as "Invalid Date".
 */
export function formatExecutionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
