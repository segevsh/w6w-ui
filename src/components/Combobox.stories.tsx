import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ComboboxOption } from "./Combobox.tsx";
import { Combobox } from "./Combobox.tsx";

const FEW: ComboboxOption[] = [
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
];

/** Long enough that `auto`'s estimate (17 × 32 = 544px) passes 60% of a typical
 *  viewport, so the story shows the popup rather than the native `<select>`. */
const MANY: ComboboxOption[] = Array.from({ length: 17 }, (_, i) => ({
  value: `env-${i + 1}`,
  label: `Environment ${i + 1}`,
}));

/**
 * `Combobox` is fully controlled — it owns only the typed text, never the value
 * — so a story that wants to SHOW a change has to own the value, exactly as a
 * host does. Same shape `ExecutionFilters.stories.tsx`'s `FiltersDemo`
 * establishes.
 */
function ComboboxDemo(props: Parameters<typeof Combobox>[0]) {
  const [value, setValue] = useState(props.value);
  return <Combobox {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Forms/Combobox",
  component: Combobox,
  args: {
    options: FEW,
    value: "succeeded",
    onChange: () => {},
    placeholder: "Pick a status…",
    "aria-label": "Status",
  },
  argTypes: {
    mode: { control: "select", options: ["auto", "select", "combobox"] },
    forceSelection: { control: "boolean" },
    optionHeight: { control: "number" },
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
    options: { control: false },
  },
  render: (args) => <ComboboxDemo {...args} />,
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A short list: `auto` estimates 3 × 32 = 96px, well under 60% of the viewport,
 *  so the component draws a plain native `<select>`. */
export const FewOptions: Story = {};

/** The same short list with the popup forced, for comparing the two renderings
 *  side by side. */
export const ForcedCombobox: Story = {
  args: { mode: "combobox" },
};

/** 17 options: `auto` picks the combobox (544px > 60% of a typical viewport), so
 *  the list is filtered by typing and the arrows/Enter pick from it. */
export const ManyOptions: Story = {
  args: { options: MANY, value: "env-3", placeholder: "Pick an environment…" },
};

/** `forceSelection={false}`: text that matches no option is accepted as the
 *  value on Enter (or blur) instead of being rolled back to the selected label. */
export const FreeText: Story = {
  args: {
    options: MANY,
    value: "env-3",
    mode: "combobox",
    forceSelection: false,
    placeholder: "Type any environment…",
  },
};

/** `disabled` while a request is already in flight. */
export const Disabled: Story = {
  args: { disabled: true },
};
