import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon.tsx";
import { iconNames } from "./icons.tsx";

const meta = {
  title: "Buttons/Icon",
  component: Icon,
  argTypes: {
    name: { control: "select", options: [...iconNames] },
    size: { control: "number" },
    label: { control: "text" },
  },
  args: { name: "history" },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The common case: a decorative 16px glyph, `aria-hidden`, colour inherited from
 *  whatever it sits in (here the surrounding text colour). */
export const Default: Story = {};

/**
 * Every name in the set, with its name under it — the one place to eyeball a
 * glyph before using it, and the check that a new entry actually draws. Colour
 * and spacing come from the `--w6w-*` tokens, like any other component here.
 */
export const Gallery: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--w6w-sp-4)",
        color: "var(--w6w-text)",
      }}
    >
      {iconNames.map((name) => (
        <figure
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--w6w-sp-1)",
            width: "var(--w6w-sp-16)",
            margin: 0,
          }}
        >
          <Icon name={name} size={24} />
          <figcaption
            style={{
              color: "var(--w6w-muted)",
              fontSize: "var(--w6w-fs-xs)",
              textAlign: "center",
            }}
          >
            {name}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** With `label` the glyph is no longer decorative: `role="img"` and that
 *  `aria-label`, for an icon standing alone rather than inside a button. */
export const Labelled: Story = {
  args: { label: "Execution history" },
};
