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

/**
 * The host's own global form chrome, which is what actually broke this row in
 * the studio: `studio/src/styles.css` gives a bare `input[type="search"|"date"]`
 * a `width: 100%`, and on a flex item whose `flex-basis` is `auto` that width IS
 * the item's basis — so each date picker asked for the whole bar and the row
 * broke into a stack, one date per line. The component's `.w6w-execution-filters
 * input[type=…]` rule out-specifies it ((0,2,1) vs (0,1,1)) and pins
 * `width: auto`/`margin: 0` back, so the bar is unaffected by a host that styles
 * bare form elements globally.
 *
 * The selector is deliberately unscoped and global, exactly like the host rule
 * it stands in for: a copy scoped to the frame would be (0,2,1) too, win on
 * source order, and break the row itself.
 */
const HOST_FORM_CHROME = `
input[type="search"],
input[type="date"] {
  width: 100%;
  margin-top: 8px;
}
`;

/**
 * The row the layout contract is about, measured in its frame: every filter set
 * (so Clear renders) and the kind select shown, which is the widest booking the
 * bar ever has. From 760px of frame width the six controls share ONE line — the
 * search box takes the spare width, the dropdowns and the date pickers keep
 * their intrinsic width, Clear stays at the end — and below that the row wraps.
 *
 * The frame is `width: 100%`, not a literal 900px, so the story can be measured
 * at any width: size the canvas/iframe to 900px for the studio History page's
 * width, 1280px to watch the search box take the extra width, and 500px to
 * watch the row wrap. The canvas is 32px wider than the bar per side —
 * Storybook's padded layout and the theme decorator, 16px each — so a 900px
 * canvas draws an 836px bar, and the 760px breakpoint above is about the BAR,
 * not about the canvas.
 *
 * `HOST_FORM_CHROME` below is what actually broke this row in the studio, so
 * the frame is a regression test for it rather than a bare render of the
 * component in isolation.
 */
export const OneRow: Story = {
  args: { value: { ...PREFILLED, to: "2026-10-03" }, showKind: true },
  decorators: [
    (Story) => (
      <div data-testid="execution-filters-frame" style={{ width: "100%" }}>
        <style>{HOST_FORM_CHROME}</style>
        <Story />
      </div>
    ),
  ],
};

/** A custom search placeholder, e.g. for a view that already knows the kind. */
export const CustomPlaceholder: Story = {
  args: { searchPlaceholder: "Filter runs…" },
};

/** `disabled` while a request is already in flight. */
export const Disabled: Story = {
  args: { value: PREFILLED, showKind: true, disabled: true },
};
