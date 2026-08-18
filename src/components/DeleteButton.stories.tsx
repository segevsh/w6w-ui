import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteButton } from "./DeleteButton.tsx";

const meta = {
  title: "Components/DeleteButton",
  component: DeleteButton,
  argTypes: {
    label: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: { label: "Delete", onClick: () => {} },
} satisfies Meta<typeof DeleteButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The canonical trash glyph, danger-styled by default (no `danger` prop to toggle). */
export const Default: Story = {};

/** `disabled` dims the glyph and suppresses the click. */
export const Disabled: Story = {
  args: { disabled: true },
};
