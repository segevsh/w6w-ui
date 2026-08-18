import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton.tsx";

/** Reused inline for the `Default` story — the same two-path pencil `EditButton` bundles. */
function PencilGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

const meta = {
  title: "Components/IconButton",
  component: IconButton,
  argTypes: {
    label: { control: "text" },
    disabled: { control: "boolean" },
    danger: { control: "boolean" },
  },
  args: { label: "Edit", onClick: () => {}, children: <PencilGlyph /> },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The primitive with a neutral glyph and no danger styling. */
export const Default: Story = {};

/** `danger` tints the glyph red on hover — the hook `DeleteButton` opts into. */
export const Danger: Story = {
  args: { label: "Delete", danger: true },
};
