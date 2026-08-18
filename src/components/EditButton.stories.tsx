import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditButton } from "./EditButton.tsx";

const meta = {
  title: "Components/EditButton",
  component: EditButton,
  argTypes: {
    label: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: { label: "Edit", onClick: () => {} },
} satisfies Meta<typeof EditButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The canonical pencil glyph, enabled. */
export const Default: Story = {};

/** `disabled` dims the glyph and suppresses the click. */
export const Disabled: Story = {
  args: { disabled: true },
};
