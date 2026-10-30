import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { TableColumn } from "../data-stores/data-store-view.ts";
import { ColumnsEditor, type ColumnsEditorProps } from "./ColumnsEditor.tsx";

/** The editor is controlled; the stories hold the state a host would. */
function Stateful(props: Partial<ColumnsEditorProps> & { initial: TableColumn[] }) {
  const { initial, ...rest } = props;
  const [columns, setColumns] = useState<TableColumn[]>(initial);
  const [keyColumn, setKeyColumn] = useState("email");
  return (
    <ColumnsEditor
      columnErrors={{}}
      {...rest}
      columns={columns}
      onChange={setColumns}
      keyColumn={keyColumn}
      onKeyColumnChange={setKeyColumn}
    />
  );
}

const initial: TableColumn[] = [
  { name: "email", type: "string", required: true },
  { name: "age", type: "integer", required: false, default: 18 },
  { name: "active", type: "boolean", required: false, default: true },
];

const meta = {
  title: "Forms/ColumnsEditor",
  component: ColumnsEditor,
  args: {
    columns: initial,
    onChange: () => {},
    keyColumn: "email",
    onKeyColumnChange: () => {},
    columnErrors: {},
  },
  render: (args) => <Stateful initial={args.columns} columnErrors={args.columnErrors} />,
} satisfies Meta<typeof ColumnsEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Defaults are typed: `18` and `true`, never the text. */
export const Default: Story = {};

export const Empty: Story = {
  args: { columns: [] },
};

/** A server refusal lands under the column it names. */
export const WithColumnError: Story = {
  args: { columnErrors: { age: "Column “age” default is not an integer." } },
};
