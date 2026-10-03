import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ExecutionFilterValue } from "./ExecutionFilters.tsx";
import { ExecutionFilters } from "./ExecutionFilters.tsx";

const EMPTY: ExecutionFilterValue = { status: "", kind: "", from: "", to: "", q: "" };

const PREFILLED: ExecutionFilterValue = {
  status: "failed",
  kind: "workflow",
  from: "2026-09-01",
  to: "",
  q: "welcome",
};

/**
 * `ExecutionFilters` is fully controlled — it holds no state of its own — so a
 * story that wants to SHOW a change has to own the value, exactly as a host
 * does. Same shape `WorkflowFlowEditor.stories.tsx`'s `FlowDemo` establishes.
 */
function FiltersDemo(props: Parameters<typeof ExecutionFilters>[0]) {
  const [value, setValue] = useState(props.value);
  return <ExecutionFilters {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Components/ExecutionFilters",
  component: ExecutionFilters,
  args: { value: EMPTY, onChange: () => {} },
  render: (args) => <FiltersDemo {...args} />,
} satisfies Meta<typeof ExecutionFilters>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The per-callable view: search, status and the date window. No kind select —
 * the page already knows which callable it is showing. Clear stays hidden
 * because nothing is filtered. */
export const Default: Story = {};

/** The project-wide view: the kind select joins the row. */
export const WithKind: Story = {
  args: { showKind: true },
};

/** Every field set, so the Clear control is rendered. */
export const Prefilled: Story = {
  args: { value: PREFILLED, showKind: true },
};

/** A custom search placeholder, e.g. for a view that already knows the kind. */
export const CustomPlaceholder: Story = {
  args: { searchPlaceholder: "Filter runs…" },
};

/** `disabled` while a request is already in flight. */
export const Disabled: Story = {
  args: { value: PREFILLED, showKind: true, disabled: true },
};
