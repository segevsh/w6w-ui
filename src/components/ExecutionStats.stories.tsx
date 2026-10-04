import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ExecutionStatsValue } from "./ExecutionStats.tsx";
import { ExecutionStats } from "./ExecutionStats.tsx";

const STATS: ExecutionStatsValue = {
  total: 128,
  succeeded: 96,
  failed: 21,
  canceled: 4,
  inFlight: 3,
  successRate: 0.6666666,
  avgDurationMs: 125400,
};

const meta = {
  title: "Executions/ExecutionStats",
  component: ExecutionStats,
  args: { stats: STATS },
} satisfies Meta<typeof ExecutionStats>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A full strip: `inFlight > 0`, so the fifth card renders, and `2/3` rounds to
 * `67%` rather than flooring to `66%`. */
export const Loaded: Story = {};

/** Nothing has loaded yet — every card reads `—` and the strip keeps four cards
 * (no `In flight` at zero), so it never changes height on first paint. */
export const NotLoaded: Story = {
  args: { stats: null },
};

/** Nothing in flight: the conditional card is absent. */
export const NothingInFlight: Story = {
  args: { stats: { ...STATS, inFlight: 0 } },
};

/** No run has finished, so there is no rate and no average — a rate over zero
 * runs is `—`, never `0%`. */
export const NoFinishedRuns: Story = {
  args: { stats: { ...STATS, successRate: null, avgDurationMs: null, inFlight: 1 } },
};

/** A caption naming the window the numbers cover. */
export const WithLabel: Story = {
  args: { label: "Last 7 days" },
};
