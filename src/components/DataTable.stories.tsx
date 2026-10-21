import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";

interface Row {
  id: string;
  name: string;
  owner: string;
}

const rows: Row[] = [
  { id: "r1", name: "Send welcome email", owner: "Ada" },
  { id: "r2", name: "Sync contacts", owner: "Grace" },
  { id: "r3", name: "Nightly report", owner: "Linus" },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name" },
  { key: "owner", header: "Owner" },
];

const meta = {
  title: "Data Display/DataTable",
  component: DataTable<Row>,
  args: { columns, rows, rowKey: (r: Row) => r.id },
} satisfies Meta<typeof DataTable<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const WithHrefRows: Story = {
  args: { getRowHref: (r: Row) => `#/items/${r.id}` },
};

export const WithActionColumn: Story = {
  args: {
    columns: [
      ...columns,
      {
        key: "actions",
        header: "",
        link: false,
        align: "right",
        render: () => <button type="button">Run</button>,
      },
    ],
    getRowHref: (r: Row) => `#/items/${r.id}`,
  },
};

export const Empty: Story = {
  args: { rows: [], empty: <p>No items yet.</p> },
};
