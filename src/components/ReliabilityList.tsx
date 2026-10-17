import type { MouseEvent, ReactElement, ReactNode } from "react";
import {
  type ReliabilityServiceView,
  displayBoard,
  uptimeDays,
} from "../reliability-board-layout.ts";
import { AppIcon } from "./AppIcon.tsx";
import { HealthStatusPill } from "./HealthStatusPill.tsx";
import { ReliabilityChart } from "./ReliabilityChart.tsx";
import { UptimeStrip } from "./UptimeStrip.tsx";

/**
 * The reliability board's presentation: needs-attention cards, the
 * performance chart and the services table, drawn from rows passed in.
 * Router-free and request-free (no provider needed) — icons come from the
 * rows' own `iconSrc`/`iconSrcDark`/`brandColor`. Loading, error and
 * no-project states belong to whatever fetches the rows.
 *
 * Navigation, at every site (issue card, service cell, chart point): with
 * `getHref` a real anchor; a click calls `onOpen(appId, event)` and is never
 * `preventDefault`ed here; only `onOpen` ⇒ a button; neither ⇒ not a link.
 */

type Open = (appId: string, event: MouseEvent<Element>) => void;

export interface ReliabilityListWindow {
  from: string;
  to: string;
  days: number;
}

export interface ReliabilityListProps<T extends ReliabilityServiceView = ReliabilityServiceView> {
  services: readonly T[];
  /** The window the rows cover; labels the heading. */
  window?: ReliabilityListWindow;
  /** Table column label ("Last N days"); defaults to `window?.days ?? 30`. */
  days?: number;
  /** Trim the display: ≤3 attention cards, `limit ?? 5` table rows, chart off. */
  compact?: boolean;
  /** Defaults to `!compact`. */
  showChart?: boolean;
  /** Compact table row cap (default 5). */
  limit?: number;
  getHref?: (appId: string) => string;
  onOpen?: Open;
  /** "Show all services →" / "view all →" render only when one of these is given. */
  showAllHref?: string;
  onShowAll?: (event: MouseEvent<Element>) => void;
  slots?: {
    /** Replaces the "Service reliability" title text. */
    header?: ReactNode;
    /** Rendered at the end of the heading row. */
    actions?: ReactNode;
    /** Replaces the "No services yet" message. */
    empty?: ReactNode;
  };
}

/** Short date for the window line ("Jun 28 – Jul 27"). */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The one anchor/button/plain wrapper every navigation site shares. */
function Target({
  appId,
  className,
  title,
  getHref,
  onOpen,
  children,
}: {
  appId: string;
  className: string;
  title?: string;
  getHref?: (appId: string) => string;
  onOpen?: Open;
  children: ReactNode;
}) {
  if (getHref) {
    return (
      <a
        className={className}
        href={getHref(appId)}
        title={title}
        onClick={onOpen ? (e) => onOpen(appId, e) : undefined}
      >
        {children}
      </a>
    );
  }
  if (onOpen) {
    return (
      <button type="button" className={className} title={title} onClick={(e) => onOpen(appId, e)}>
        {children}
      </button>
    );
  }
  return (
    <div className={className} title={title}>
      {children}
    </div>
  );
}

/** "Did YOUR calls succeed" — shared by the table cell and the issue card. */
function ExecStatusSignal({ service }: { service: ReliabilityServiceView }) {
  return (
    <span className="w6w-rel-signal">
      <HealthStatusPill state={service.state} />
      {service.ongoingOutageId && <span className="w6w-rel-tag">outage open</span>}
      {service.calls === 0 && <span className="w6w-muted w6w-small">no calls</span>}
    </span>
  );
}

/**
 * The API's own status, from the app's declared public health check. Kept a
 * SEPARATE signal from `ExecStatusSignal`: they answer different questions and
 * routinely disagree usefully. `null` ⇒ "not published", not an `unknown` pill.
 */
function ApiStatusSignal({ vendor }: { vendor: ReliabilityServiceView["vendorStatus"] }) {
  if (!vendor) return <span className="w6w-muted w6w-small">not published</span>;
  // `unknown` is about US, not the API: we asked and could not tell.
  const unreadable = vendor.state === "unknown";
  return (
    <span className="w6w-rel-signal" title={vendor.message ?? undefined}>
      <HealthStatusPill state={vendor.state} label={unreadable ? "Unavailable" : undefined} />
      {!unreadable && vendor.message && (
        <span className="w6w-rel-vendor-msg w6w-small">{vendor.message}</span>
      )}
    </span>
  );
}

interface NavProps {
  getHref?: (appId: string) => string;
  onOpen?: Open;
}

function IssueCard({ service, getHref, onOpen }: { service: ReliabilityServiceView } & NavProps) {
  return (
    <Target
      appId={service.appId}
      className="w6w-rel-issue-card"
      title={`${service.displayName} — open service detail`}
      getHref={getHref}
      onOpen={onOpen}
    >
      <span className="w6w-rel-issue-head">
        <AppIcon
          src={service.iconSrc}
          srcDark={service.iconSrcDark}
          brandColor={service.brandColor}
          name={service.displayName}
          size={24}
        />
        <span className="w6w-rel-issue-head-text">
          <strong>{service.displayName}</strong>
          {service.attention === "recent" && (
            <span className="w6w-muted w6w-small">trouble earlier in this window</span>
          )}
        </span>
      </span>
      <span className="w6w-rel-issue-signals">
        <span className="w6w-rel-issue-signal">
          <span className="w6w-muted w6w-small">w6w exec</span>
          <ExecStatusSignal service={service} />
        </span>
        <span className="w6w-rel-issue-signal">
          <span className="w6w-muted w6w-small">API status</span>
          <ApiStatusSignal vendor={service.vendorStatus} />
        </span>
      </span>
    </Target>
  );
}

function ServiceTableRow({
  service,
  getHref,
  onOpen,
}: { service: ReliabilityServiceView } & NavProps) {
  const noCalls = service.calls === 0;
  return (
    <tr
      className={`w6w-rel-tr${service.attention !== "none" ? " w6w-rel-attention" : ""}`}
      data-attention={service.attention === "none" ? undefined : service.attention}
    >
      <td className="w6w-rel-td-service">
        <Target appId={service.appId} className="w6w-rel-open" getHref={getHref} onOpen={onOpen}>
          <AppIcon
            src={service.iconSrc}
            srcDark={service.iconSrcDark}
            brandColor={service.brandColor}
            name={service.displayName}
            size={28}
          />
          <span className="w6w-rel-td-service-text">
            <strong>{service.displayName}</strong>
            <code className="w6w-muted w6w-small">{service.appId}</code>
          </span>
        </Target>
      </td>

      <td className="w6w-rel-td-status">
        <span className="w6w-rel-status-row">
          <span className="w6w-rel-status-label w6w-muted w6w-small">Ops</span>
          <ExecStatusSignal service={service} />
        </span>
        <span className="w6w-rel-status-row">
          <span className="w6w-rel-status-label w6w-muted w6w-small">API</span>
          <ApiStatusSignal vendor={service.vendorStatus} />
        </span>
      </td>

      <td className="w6w-rel-td-uptime">
        {noCalls ? (
          // A zero-call window is one identical hatched strip — the note says it better.
          <span className="w6w-rel-idle-note">No calls in this window</span>
        ) : (
          <>
            {/* Oldest day first, exactly as the server sent it. */}
            <UptimeStrip
              days={uptimeDays(service)}
              ariaLabel={`${service.displayName}, ${service.uptime.length}-day status, oldest day first`}
            />
            <span className="w6w-muted w6w-small">{service.calls} calls</span>
          </>
        )}
      </td>

      <td className="w6w-rel-td-p95">{service.p95Ms === null ? "—" : `${service.p95Ms} ms`}</td>
    </tr>
  );
}

export function ReliabilityList<T extends ReliabilityServiceView>({
  services,
  window: win,
  days,
  compact = false,
  showChart,
  limit,
  getHref,
  onOpen,
  showAllHref,
  onShowAll,
  slots,
}: ReliabilityListProps<T>): ReactElement {
  const windowDays = days ?? win?.days ?? 30;
  // Reads `state` ONLY, on purpose: the card's copy says every service "came
  // back ok", a statement about YOUR CALLS that stays true while a vendor
  // reports an incident you have not hit. The grouping below reads `attention`.
  const allClear = services.length > 0 && services.every((s) => s.calls > 0 && s.state === "ok");
  const {
    attentionCount,
    shownNow,
    shownRecent,
    hiddenAttentionCount,
    shownTable,
    hiddenTableCount,
  } = displayBoard(services, { compact, limit });
  const shouldShowChart = showChart ?? !compact;
  const canShowAll = showAllHref !== undefined || onShowAll !== undefined;
  const showAllLink = (text: string): ReactNode =>
    canShowAll ? (
      <a
        href={showAllHref}
        className={text.startsWith("Show") ? "w6w-muted w6w-small" : undefined}
        onClick={onShowAll}
      >
        {text}
      </a>
    ) : null;

  return (
    <section className="w6w-rel-section">
      <h3 className="w6w-rel-heading">
        <span>
          {slots?.header ?? "Service reliability"}{" "}
          {win && (
            <span className="w6w-muted w6w-small">
              {formatDay(win.from)} – {formatDay(win.to)} · {win.days} days
            </span>
          )}
        </span>
        {compact && showAllLink("Show all services →")}
        {slots?.actions}
      </h3>

      <div className={compact ? "w6w-rel-card" : undefined}>
        <p className="w6w-muted w6w-small w6w-rel-intro">
          Connected services across your account. Performance for the selected project.
        </p>

        {allClear && (
          <div className={compact ? "w6w-rel-allclear" : "w6w-rel-card w6w-rel-allclear"}>
            <h4>All clear</h4>
            <p>
              Every service you called in the last {windowDays} days came back{" "}
              <HealthStatusPill state="ok" /> — no degraded stretches, no outages.
            </p>
          </div>
        )}

        {services.length === 0 &&
          (slots?.empty ?? (
            <div className={compact ? undefined : "w6w-rel-card"}>
              <p className="w6w-muted">
                No services yet — connect an integration or use a service in this project.
              </p>
            </div>
          ))}

        {services.length > 0 && (
          <>
            {attentionCount > 0 && (
              <div className="w6w-rel-group">
                <h4 className="w6w-rel-group-head">
                  Needs attention{" "}
                  <span className="w6w-muted w6w-small">
                    {shownNow.length + shownRecent.length} of {attentionCount}
                  </span>
                </h4>
                <div className="w6w-rel-issues">
                  {[...shownNow, ...shownRecent].map((s) => (
                    <IssueCard key={s.appId} service={s} getHref={getHref} onOpen={onOpen} />
                  ))}
                </div>
                {hiddenAttentionCount > 0 && (
                  <p className="w6w-muted w6w-small w6w-rel-more-note">
                    {hiddenAttentionCount} more {hiddenAttentionCount === 1 ? "needs" : "need"}{" "}
                    attention{canShowAll && <> — {showAllLink("view all →")}</>}
                  </p>
                )}
              </div>
            )}

            {shouldShowChart && (
              <div className="w6w-rel-group">
                <h4 className="w6w-rel-group-head">Performance across your APIs</h4>
                <ReliabilityChart services={services} getHref={getHref} onOpen={onOpen} />
              </div>
            )}

            {shownTable.length > 0 && (
              <div className="w6w-rel-group">
                <h4 className="w6w-rel-group-head">
                  {compact ? "Services" : "All services"}{" "}
                  <span className="w6w-muted w6w-small">
                    {compact ? `${shownTable.length} of ${services.length}` : services.length}
                  </span>
                </h4>
                <div className="w6w-rel-table-wrap">
                  <table className="w6w-rel-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Status</th>
                        <th>Last {windowDays} days</th>
                        <th>Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownTable.map((s) => (
                        <ServiceTableRow
                          key={s.appId}
                          service={s}
                          getHref={getHref}
                          onOpen={onOpen}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {hiddenTableCount > 0 && (
                  <p className="w6w-muted w6w-small w6w-rel-more-note">
                    {hiddenTableCount} more{canShowAll && <> — {showAllLink("view all →")}</>}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
