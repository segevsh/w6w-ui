import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerResourcesCardSmall } from "./ServerResources.tsx";
import { demoServerResourceSamples } from "./server-resources.fixture.ts";

const SAMPLES = demoServerResourceSamples(60);

const meta = {
  title: "Server Resources/ServerResourcesCardSmall",
  component: ServerResourcesCardSmall,
  args: { samples: SAMPLES },
} satisfies Meta<typeof ServerResourcesCardSmall>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CPU + memory with the CPU sparkline — the compact variant. */
export const Populated: Story = {};

/** No samples: dashes, no line, still mounted. */
export const Empty: Story = {
  args: { samples: [] },
};
