import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTableGrid } from "./DataTableGrid.tsx";

const noop = () => {};

const meta: Meta<typeof DataTableGrid> = {
  title: "Data Display/DataTableGrid",
  component: DataTableGrid,
  args: {
    columns: [
      { name: "sku", type: "string", required: true },
      { name: "qty", type: "integer", required: false },
    ],
    keyColumn: "sku",
    rows: [
      { id: "a-1", cells: { sku: "a-1", qty: "4" }, version: 1, dirty: false },
      { id: "b-2", cells: { sku: "b-2", qty: "12" }, version: 3, dirty: true },
    ],
    onCellChange: noop,
    onSave: noop,
    onDelete: noop,
    onReload: noop,
    onAddRow: noop,
    onLoadMore: noop,
    onSearch: noop,
  },
};
export default meta;

type Story = StoryObj<typeof DataTableGrid>;

export const Default: Story = {};

export const NewRow: Story = {
  args: {
    rows: [{ id: "new", isNew: true, cells: { sku: "", qty: "" }, version: null, dirty: true }],
  },
};

export const CellError: Story = {
  args: {
    rows: [
      {
        id: "b-2",
        cells: { sku: "b-2", qty: "many" },
        version: 3,
        dirty: true,
        cellErrors: { qty: "Expected an integer." },
      },
    ],
  },
};

export const Conflict: Story = {
  args: {
    rows: [{ id: "a-1", cells: { sku: "a-1", qty: "4" }, version: 1, dirty: true, conflict: true }],
  },
};

export const GridError: Story = { args: { error: "Could not save the row." } };

export const HasMore: Story = { args: { hasMore: true } };

export const Empty: Story = { args: { rows: [] } };
