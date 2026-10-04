import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerResourcesRail } from "./ServerResources.tsx";
import { demoServerResourceSamples } from "./server-resources.fixture.ts";

const SAMPLES = demoServerResourceSamples(60);

const meta = {
  title: "Server Resources/ServerResourcesRail",
  component: ServerResourcesRail,
  args: { samples: SAMPLES },
  /**
   * The rail's real home is a ~200 px sidebar column, so every story is shown
   * at that width — the variant's whole design constraint is fitting there.
   */
  decorators: [
    (Story) => (
      <div style={{ width: 200 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ServerResourcesRail>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CPU and MEM, each with a line, plus the expand affordance. */
export const Populated: Story = {
  args: { onExpand: () => {} },
};

/** No samples: two dashes, no lines, still the expand button. */
export const Empty: Story = {
  args: { samples: [], onExpand: () => {} },
};
