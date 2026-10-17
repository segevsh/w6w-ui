import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReliabilityServiceView } from "../reliability-board-layout.ts";
import { ReliabilityList } from "./ReliabilityList.tsx";

const DAYS = (down: number[] = [], degraded: number[] = []): ReliabilityServiceView["uptime"] =>
  Array.from({ length: 30 }, (_, i) => ({
    day: `2026-07-${String(i + 1).padStart(2, "0")}`,
    state: down.includes(i) ? "down" : degraded.includes(i) ? "degraded" : "ok",
  }));

const NO_ERRORS = { e4xx: 0, e429: 0, eAuth: 0, e5xx: 0 };

const SERVICES: ReliabilityServiceView[] = [
  {
    appId: "io.w6w.slack",
    displayName: "Slack",
    brandColor: "#4a154b",
    state: "down",
    calls: 1840,
    errors: { e4xx: 12, e429: 40, eAuth: 3, e5xx: 71 },
    p95Ms: 820,
    ongoingOutageId: "out_1",
    uptime: DAYS([27, 28, 29]),
    vendorStatus: { state: "degraded", message: "Elevated message delivery latency" },
    attention: "now",
  },
  {
    appId: "io.w6w.dropbox",
    displayName: "Dropbox",
    brandColor: "#0061ff",
    state: "ok",
    calls: 420,
    errors: NO_ERRORS,
    p95Ms: 230,
    ongoingOutageId: null,
    uptime: DAYS(),
    vendorStatus: { state: "degraded", message: "Partially Degraded Service" },
    attention: "now",
  },
  {
    appId: "io.w6w.sendgrid",
    displayName: "SendGrid",
    brandColor: "#1a82e2",
    state: "ok",
    calls: 3100,
    errors: { e4xx: 4, e429: 0, eAuth: 0, e5xx: 1 },
    p95Ms: 140,
    ongoingOutageId: null,
    uptime: DAYS([], [10, 11]),
    vendorStatus: { state: "ok", message: null },
    attention: "recent",
  },
  {
    appId: "io.w6w.stripe",
    displayName: "Stripe",
    brandColor: "#635bff",
    state: "ok",
    calls: 960,
    errors: NO_ERRORS,
    p95Ms: 95,
    ongoingOutageId: null,
    uptime: DAYS(),
    vendorStatus: { state: "ok", message: null },
    attention: "none",
  },
  {
    appId: "io.w6w.notion",
    displayName: "Notion",
    brandColor: "#000000",
    state: "unknown",
    calls: 0,
    errors: NO_ERRORS,
    p95Ms: null,
    ongoingOutageId: null,
    uptime: DAYS().map((d) => ({ ...d, state: "unknown" as const })),
    vendorStatus: null,
    attention: "none",
  },
];

const WINDOW = { from: "2026-07-01T00:00:00Z", to: "2026-07-30T00:00:00Z", days: 30 };

const meta = {
  title: "Status/ReliabilityList",
  component: ReliabilityList,
  args: { services: SERVICES, window: WINDOW },
} satisfies Meta<typeof ReliabilityList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The full board: attention cards, performance chart, every service. */
export const Full: Story = {};

/** The dashboard mount: capped cards and rows, with "Show all" links. */
export const Compact: Story = {
  args: { compact: true, limit: 3, showAllHref: "/reliability" },
};

/** Compact, with the chart opted back in. */
export const CompactWithChart: Story = {
  args: { compact: true, showChart: true, showAllHref: "/reliability" },
};

/** With `getHref` every card, service cell and chart point is a real anchor. */
export const Linked: Story = {
  args: { getHref: (id: string) => `#/reliability/${id}`, onOpen: () => {} },
};

/** Every service came back ok on the caller's own calls. */
export const AllClear: Story = {
  args: {
    services: SERVICES.filter((s) => s.state === "ok" && s.calls > 0 && s.attention === "none"),
  },
};

export const Empty: Story = {
  args: { services: [] },
};
