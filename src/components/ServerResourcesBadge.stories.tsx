import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerResourcesBadge } from "./ServerResources.tsx";
import { demoServerResourceSamples } from "./server-resources.fixture.ts";

const SAMPLES = demoServerResourceSamples(60);

const meta = {
  title: "Server Resources/ServerResourcesBadge",
  component: ServerResourcesBadge,
  args: { samples: SAMPLES },
} satisfies Meta<typeof ServerResourcesBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The header one-liner: `CPU <pct> · MEM <pct>`, no sparkline by design. */
export const Populated: Story = {};

/** No samples: `CPU — · MEM —`. The badge still renders. */
export const Empty: Story = {
  args: { samples: [] },
};
