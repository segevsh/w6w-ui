import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerResourcesCard } from "./ServerResources.tsx";
import { demoServerResourceSamples } from "./server-resources.fixture.ts";

const SAMPLES = demoServerResourceSamples(60);

const meta = {
  title: "Components/ServerResourcesCard",
  component: ServerResourcesCard,
  args: { samples: SAMPLES, title: "Server resources", intervalMs: 5000 },
} satisfies Meta<typeof ServerResourcesCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A minute of samples from an 8-CPU host under a 2-CPU limit — all three lines populated. */
export const Populated: Story = {};

/**
 * No samples yet (the stream has not delivered anything). The card still
 * renders, every reading is `—`, and no polyline is drawn — a caller never has
 * to branch before mounting it.
 */
export const Empty: Story = {
  args: { samples: [], intervalMs: undefined },
};
