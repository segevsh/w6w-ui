import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoTip } from "./InfoTip.tsx";

const meta = {
  title: "Buttons/InfoTip",
  component: InfoTip,
  argTypes: { label: { control: "text" } },
  args: { label: "About this field", children: "Shown only after the button is clicked." },
} satisfies Meta<typeof InfoTip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Collapsed by default — click the "i" to reveal the explanation. */
export const Default: Story = {};
