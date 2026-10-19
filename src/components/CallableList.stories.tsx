import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallableList, type CallableListRow } from "./CallableList.tsx";

const rows: CallableListRow[] = [
  { id: "fn_a", title: "Send welcome email", description: "fn_a", archived: false },
  { id: "fn_b", title: "Sync invoices", description: "fn_b", archived: false },
  { id: "fn_c", title: "Old importer", description: "fn_c", archived: true },
];

const meta = {
  title: "Data Display/CallableList",
  component: CallableList,
  args: {
    rows,
    title: "Functions",
    description: "Reusable steps you can call from a workflow.",
    emptyCopy: "No functions yet.",
    newLabel: "New function",
    onCreate: () => {},
    onImport: () => {},
    onOpen: () => {},
  },
} satisfies Meta<typeof CallableList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With `getHref` each row is a real anchor; the click still reaches `onOpen`. */
export const WithHref: Story = {
  args: { getHref: (id) => `#/functions/${id}` },
};

export const ShowingArchived: Story = {
  args: { showArchived: true },
};

/** Every row is archived and "Show archived" is off: an EmptyState with a control to reveal them. */
export const ArchivedOnly: Story = {
  args: {
    rows: [
      { id: "a", title: "Alpha", archived: true },
      { id: "b", title: "Beta", archived: true },
    ],
  },
};

export const Empty: Story = {
  args: { rows: [] },
};

export const Creating: Story = {
  args: { creating: true, error: "Could not create the function." },
};
