import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReliabilityServiceView } from "../reliability-board-layout.ts";
import { ReliabilityChart } from "./ReliabilityChart.tsx";

function point(
  appId: string,
  state: ReliabilityServiceView["state"],
  calls: number,
  p95Ms: number | null,
  errors = 0,
): ReliabilityServiceView {
  return {
    appId,
    displayName: appId,
    state,
    calls,
    errors: { e4xx: errors, e429: 0, eAuth: 0, e5xx: 0 },
    p95Ms,
    ongoingOutageId: null,
    uptime: [],
    vendorStatus: null,
    attention: "none",
  };
}

const SERVICES = [
  point("Slack", "down", 1840, 820, 120),
  point("SendGrid", "degraded", 3100, 140, 5),
  point("Stripe", "ok", 960, 95),
  point("Dropbox", "ok", 420, 230, 2),
  point("Notion", "unknown", 0, null),
];

const meta = {
  title: "Status/ReliabilityChart",
  component: ReliabilityChart,
  args: { services: SERVICES },
} satisfies Meta<typeof ReliabilityChart>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Up is faster, right is more calls. Notion has no timed call, so it is not plotted. */
export const Default: Story = {};

/** With `getHref` each point is a real SVG anchor. */
export const Linked: Story = {
  args: { getHref: (id: string) => `#/reliability/${id}`, onOpen: () => {} },
};

/** Nothing timed in the window. */
export const NoTimedCalls: Story = {
  args: { services: [point("Notion", "unknown", 0, null)] },
};
