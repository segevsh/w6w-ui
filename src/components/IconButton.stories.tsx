import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { iconNames } from "./icons.tsx";

const meta = {
  title: "Buttons/IconButton",
  component: IconButton,
  argTypes: {
    label: { control: "text" },
    disabled: { control: "boolean" },
    danger: { control: "boolean" },
    icon: { control: "select", options: iconNames },
    iconSize: { control: "number" },
    title: { control: "text" },
  },
  args: { label: "Edit", onClick: () => {} },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The primitive with a caller-supplied glyph and no danger styling — the shared
 *  `Icon` set is the easiest source of one now. */
export const Default: Story = {
  args: { children: <Icon name="edit" /> },
};

/** `danger` tints the glyph red on hover — the hook `DeleteButton` opts into. */
export const Danger: Story = {
  args: { label: "Delete", danger: true, children: <Icon name="delete" /> },
};

/** The named-glyph path: `icon="history"` renders `<Icon>` itself, so a caller
 *  never has to hand-draw an SVG for a glyph the set already holds. */
export const IconByName: Story = {
  args: { label: "Execution history", icon: "history" },
};

/** `title` moves the TOOLTIP only — `aria-label` stays "Execution history",
 *  which is studio's disabled-history case ("No executions yet" as the tooltip). */
export const TooltipOverride: Story = {
  args: {
    label: "Execution history",
    title: "No executions yet",
    icon: "history",
    disabled: true,
  },
};
